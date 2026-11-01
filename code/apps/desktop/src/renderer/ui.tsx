import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@speakkit/ui";
import type { AppState, PreviewAudio } from "../shared/ipc";

declare global {
  interface Window {
    speakkit: import("../shared/ipc").Api;
  }
}
export const api = window.speakkit;

export function useAppState(): AppState | null {
  const [s, setS] = useState<AppState | null>(null);
  useEffect(() => {
    api.state().then(setS);
    return api.onState((n) => setS({ ...n }));
  }, []);
  return s;
}

/** Applies the chosen theme to the document (system leaves it to prefers-color-scheme). */
export function useTheme(theme: "system" | "light" | "dark" | undefined) {
  useEffect(() => {
    if (!theme || theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
}

/** True while the window is shown. Hidden means: no polling, animations paused (main stops its health timer too). */
export function useVisible(): boolean {
  const [vis, setVis] = useState(!document.hidden);
  useEffect(() => {
    const f = () => {
      setVis(!document.hidden);
      if (document.hidden) document.documentElement.setAttribute("data-hidden", "");
      else document.documentElement.removeAttribute("data-hidden");
    };
    f();
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return vis;
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="sk-logo" style={{ width: size, height: size, gap: Math.max(1.5, size * 0.07) }} aria-hidden>
      {[0.28, 0.5, 0.7, 0.42, 0.22].map((h, i) => (
        <i key={i} style={{ height: size * h, width: Math.max(2, size * 0.08) }} />
      ))}
    </span>
  );
}

export const formatBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;

const mask = (t: string) => (t ? `${"•".repeat(14)}-${t.slice(-4)}` : "starting…");

/** Pairing token: masked until revealed. Regenerate can ask for confirmation (Settings) or act at once (Home). */
export function TokenField({
  token,
  regenerate,
  confirmRegenerate,
  onCopied,
}: {
  token: string;
  regenerate?: boolean;
  confirmRegenerate?: boolean;
  onCopied?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const doRegenerate = async () => {
    setBusy(true);
    try {
      await api.regenerateToken();
      setShown(false);
    } finally {
      setBusy(false);
      setAsk(false);
    }
  };
  return (
    <div className="sk-token">
      <div className="sk-token__box" data-testid="token" data-revealed={shown}>
        {shown ? token : mask(token)}
      </div>
      <Button iconLeft={shown ? "eye-off" : "eye"} aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? "Hide" : "Reveal"}
      </Button>
      <Button
        variant="primary"
        iconLeft="copy"
        disabled={!token}
        onClick={async () => {
          await api.copy(token);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      {regenerate && (
        <Button iconLeft="refresh" disabled={busy} onClick={() => (confirmRegenerate ? setAsk(true) : doRegenerate())}>
          Regenerate
        </Button>
      )}
      {confirmRegenerate && (
        <Modal
          open={ask}
          onClose={() => setAsk(false)}
          title="Regenerate the pairing token?"
          width={440}
          footer={
            <>
              <Button onClick={() => setAsk(false)}>Cancel</Button>
              <Button variant="danger" solid loading={busy} onClick={doRegenerate}>
                Regenerate
              </Button>
            </>
          }
        >
          <p className="sk-modal-text" style={{ margin: 0 }}>
            Every paired browser stops working until you paste the new token in its options.
          </p>
        </Modal>
      )}
    </div>
  );
}

export function Page({ title, lead, wide, children }: { title: string; lead?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`sk-page ${wide ? "sk-page--wide" : ""}`}>
      <div className="sk-page__head">
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}

// ---- audio preview: one cached AudioContext, chunks scheduled back to back ----
let ctx: AudioContext | null = null;
export function playAudio(a: PreviewAudio, onEnd: () => void): () => void {
  ctx ??= new AudioContext({ sampleRate: a.sampleRate });
  if (ctx.state === "suspended") void ctx.resume();
  let t = ctx.currentTime + 0.05;
  const nodes: AudioBufferSourceNode[] = [];
  for (const pcm of a.chunks) {
    const buf = ctx.createBuffer(1, pcm.length, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i]! / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(t);
    t += buf.duration;
    nodes.push(src);
  }
  const last = nodes.at(-1);
  if (!last) queueMicrotask(onEnd);
  else
    last.onended = () => {
      onEnd();
      // Release the audio device when nothing plays (idle cost).
      void ctx?.suspend();
    };
  return () => {
    for (const n of nodes) {
      n.onended = null;
      try {
        n.stop();
      } catch {
        /* not started */
      }
    }
    onEnd();
    void ctx?.suspend();
  };
}

const cleanError = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e);

/** Preview player: at most one reading plays at a time; returns the playing key. */
export function usePreview(speed = 1) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const gen = useRef(0);
  useEffect(() => () => stop.current?.(), []);
  const halt = () => {
    gen.current++;
    stop.current?.();
    stop.current = null;
    setPlaying(null);
  };
  const toggle = async (voice: string, text: string, key = voice) => {
    const was = playing;
    halt();
    if (was === key) return;
    const mine = gen.current;
    setError(null);
    setPlaying(key);
    try {
      const audio = await api.preview(voice, text, speed);
      if (mine !== gen.current) return;
      stop.current = playAudio(audio, () => setPlaying((p) => (p === key ? null : p)));
    } catch (e) {
      if (mine !== gen.current) return;
      setPlaying(null);
      setError(cleanError(e));
    }
  };
  return { playing, error, toggle, halt };
}
