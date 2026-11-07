import { useCallback, useEffect, useRef, useState } from "react";
import { Player, soundTouchStretch, type PlayerConfig } from "@speakkit/player";
import { SAMPLE_RATE, parseHealth, type EngineState, type PlayerCommand, type PlayerState, type ReadDoc, type SentenceStart } from "@speakkit/protocol";
import { createProxyFetch } from "./proxy-fetch";
import { routeThroughGain, type GainLike } from "./volume";

const IDLE: PlayerState = { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: 1, voice: "", queueLength: 0 };

interface ReaderPlayer {
  state: PlayerState;
  play(doc: ReadDoc, cfg: PlayerConfig): void;
  command(cmd: PlayerCommand): void;
  /** Output level, 0 to 1. Applies to what is playing now and to later playback. */
  volume: number;
  setVolume(v: number): void;
}

/** The output level; each new audio context gets a gain node at the current level, and changes reach the one that is playing. */
function useVolume() {
  const [volume, setVolume] = useState(1);
  const level = useRef(1);
  const gain = useRef<GainLike>(undefined);
  const attach = useCallback((ctx: Parameters<typeof routeThroughGain>[0]) => void (gain.current = routeThroughGain(ctx, level.current)), []);
  const set = useCallback((v: number) => {
    level.current = v;
    setVolume(v);
    if (gain.current) gain.current.gain.value = v;
  }, []);
  return { volume, attach, set };
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
  const { volume, attach, set: setVolume } = useVolume();

  const get = useCallback(
    (cfg: PlayerConfig) => {
      if (!player.current) {
        const proxy = createProxyFetch(window.speakkitLibrary);
        const send = (path: string, init?: RequestInit) => proxy(`http://127.0.0.1${path}`, init);
        player.current = new Player(
          {
            createContext: () => {
              const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "playback" });
              attach(ctx);
              return ctx as never;
            },
            fetch: proxy,
            emitState: setState,
            emitSentence: (s) => sentence.current(s),
            stretch: soundTouchStretch(),
            hold: (ms) => void send("/v1/engine/hold", { method: "POST", body: JSON.stringify({ ms }) }).catch(() => {}), // a missed hold only lets the model unload sooner
            engineState: async (): Promise<EngineState | undefined> => {
              try {
                return parseHealth(await (await send("/v1/health")).json())?.engine.state;
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
    },
    [attach],
  );

  useEffect(
    () => () => {
      player.current?.command({ cmd: "stop" });
    },
    [],
  );

  const play = useCallback((doc: ReadDoc, cfg: PlayerConfig) => get(cfg).command({ cmd: "play", doc }, cfg), [get]);
  const command = useCallback((cmd: PlayerCommand) => player.current?.command(cmd), []);
  return { state, play, command, volume, setVolume };
}
