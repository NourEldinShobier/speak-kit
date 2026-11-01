import { useCallback, useEffect, useRef, useState } from "react";
import { Player, soundTouchStretch, type PlayerConfig } from "@speakkit/player";
import { SAMPLE_RATE, type EngineState, type Health, type PlayerCommand, type PlayerState, type ReadDoc, type SentenceStart } from "@speakkit/protocol";
import { createProxyFetch } from "./proxy-fetch";

const IDLE: PlayerState = { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: 1, voice: "", queueLength: 0 };

export interface ReaderPlayer {
  state: PlayerState;
  play(doc: ReadDoc, cfg: PlayerConfig): void;
  command(cmd: PlayerCommand): void;
}

/**
 * The shared playback core (packages/player) in the reader. The server is reached through the main-process proxy;
 * the audio context lives only while something plays (the player closes it when playback stops).
 */
export function useReaderPlayer(onSentence: (s: SentenceStart) => void): ReaderPlayer {
  const [state, setState] = useState<PlayerState>(IDLE);
  const sentence = useRef(onSentence);
  sentence.current = onSentence;
  const player = useRef<Player>(undefined);

  const get = useCallback((cfg: PlayerConfig) => {
    if (!player.current) {
      const proxy = createProxyFetch(window.speakkitLibrary);
      const send = (path: string, init?: RequestInit) => proxy(`http://127.0.0.1${path}`, init);
      player.current = new Player(
        {
          createContext: () => new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "playback" }) as never,
          fetch: proxy,
          emitState: setState,
          emitSentence: (s) => sentence.current(s),
          stretch: soundTouchStretch(),
          hold: (ms) => void send("/v1/engine/hold", { method: "POST", body: JSON.stringify({ ms }) }).catch(() => {}),
          engineState: async (): Promise<EngineState | undefined> => {
            try {
              return ((await (await send("/v1/health")).json()) as Health).engine.state;
            } catch {
              return undefined;
            }
          },
        },
        cfg,
        false,
      );
    }
    return player.current;
  }, []);

  useEffect(
    () => () => {
      player.current?.command({ cmd: "stop" });
    },
    [],
  );

  const play = useCallback((doc: ReadDoc, cfg: PlayerConfig) => get(cfg).command({ cmd: "play", doc }, cfg), [get]);
  const command = useCallback((cmd: PlayerCommand) => player.current?.command(cmd), []);
  return { state, play, command };
}
