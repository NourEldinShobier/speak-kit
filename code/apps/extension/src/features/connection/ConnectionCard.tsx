import { useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, IconButton, TextInput } from "@speakkit/ui";
import { maskToken, type Settings } from "../settings";
import { send, type HealthResult } from "../../shared/client";
import { engineText } from "./errors";
import { connState, validPort } from "./hooks";
import { LINKS, openUrl } from "../../shared/links";

interface Props {
  s: Settings;
  upd: (fn: (s: Settings) => Settings) => void;
  health: HealthResult | null;
  refresh: () => Promise<HealthResult>;
  token: string;
  setToken: (t: string) => void;
}

type ConnState = ReturnType<typeof connState>;
type Connected = Extract<HealthResult, { ok: true }>;

const STATUS_TEXT: Record<Exclude<ConnState, "ok">, { title: string; sub: string }> = {
  token: { title: "Pairing token rejected", sub: "This browser's token doesn't match the app." },
  offline: { title: "Speak Kit isn't running", sub: "Nothing is answering on this computer." },
  checking: { title: "Checking connection", sub: "Looking for Speak Kit on this computer." },
};
const ALERT_TEXT = {
  offline: "Open Speak Kit and this page reconnects by itself. If it doesn't, download the app first.",
  token: "Speak Kit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch.",
};

/** The text of the status line; `ok` is the health answer when connected. */
function statusText(st: ConnState, ok: Connected | null): { title: string; sub: string } {
  if (ok) return { title: `Connected to Speak Kit ${ok.health.version}`, sub: `${engineText(ok.health.engine.state, ok.health.engine.progress)} · answered in ${ok.ms} ms` };
  return STATUS_TEXT[st === "ok" ? "checking" : st];
}

const STATUS_ICON = { ok: "check", checking: "loader-2", offline: "x", token: "x" } as const;
const STATUS_CLASS = { ok: "ok", checking: "", offline: "err", token: "err" } as const;

/** Editing the pairing token: the masked or revealed value, a draft being typed, pasting and committing it. */
function useTokenEditor({ token, setToken, test, rejected }: { token: string; setToken: (t: string) => void; test: () => Promise<void>; rejected: boolean }) {
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rejected) ref.current?.focus();
  }, [rejected]);
  const repair = () => {
    setReveal(false);
    setDraft("");
    setTimeout(() => ref.current?.focus(), 0);
  };
  const commit = async () => {
    const v = (draft ?? "").trim();
    setDraft(null);
    if (v && v !== token) {
      setToken(v);
      await test();
    }
  };
  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        setToken(t);
        setDraft(null);
        await test();
        return;
      }
    } catch {
      /* clipboard blocked: fall back to the field */
    }
    repair();
  };
  // A rejected token shows an empty, focused field waiting for the new one (C3).
  const shown = reveal ? token : maskToken(token);
  const value = draft ?? (rejected ? "" : shown);
  return { ref, reveal, toggleReveal: () => setReveal((r) => !r), draft, setDraft, value, repair, commit, paste };
}

interface StatusProps {
  st: ConnState;
  ok: Connected | null;
  busy: boolean;
  onTest: () => void;
  onRepair: () => void;
  onPaste: () => void;
  refresh: () => Promise<HealthResult>;
}

function ConnActions({ st, ok, busy, onTest, onRepair, onPaste, refresh }: StatusProps) {
  const [launching, setLaunching] = useState(false);
  const launch = async () => {
    setLaunching(true);
    try {
      await send({ t: "launch-app" });
      await refresh();
    } finally {
      setLaunching(false);
    }
  };
  return (
    <div className="op-conn-r">
      <Button variant={ok ? "secondary" : "ghost"} iconLeft="refresh" onClick={onTest} disabled={busy}>
        {busy ? "Testing…" : "Test connection"}
      </Button>
      {st === "offline" && (
        <>
          <Button iconLeft="download" onClick={() => openUrl(LINKS.download)}>
            Download app
          </Button>
          <Button variant="primary" iconLeft="external-link" loading={launching} onClick={launch}>
            Open Speak Kit
          </Button>
        </>
      )}
      {st === "token" && (
        <>
          <Button iconLeft="link" onClick={onRepair}>
            Re-pair
          </Button>
          <Button variant="primary" iconLeft="clipboard" onClick={onPaste}>
            Paste new token
          </Button>
        </>
      )}
      {st === "ok" && (
        <Button iconLeft="link" onClick={onRepair}>
          Re-pair
        </Button>
      )}
    </div>
  );
}

function ConnStatus(p: StatusProps) {
  const { title, sub } = statusText(p.st, p.ok);
  return (
    <div className="op-conn" data-state={p.st}>
      <div className="op-conn-l">
        <span className={`op-conn-ic ${STATUS_CLASS[p.st]}`}>
          <Icon name={STATUS_ICON[p.st]} size={20} className={p.st === "checking" ? "lm-spin" : undefined} />
        </span>
        <div>
          <div className="op-conn-t" role="status">
            {title}
          </div>
          <div className="op-conn-s">{sub}</div>
        </div>
      </div>
      <ConnActions {...p} />
    </div>
  );
}

function ConnAlert({ st, port, health }: { st: "offline" | "token"; port: number; health: HealthResult | null }) {
  const [details, setDetails] = useState(false);
  return (
    <div className="op-alert" role="alert">
      <Banner tone="warning" icon="alert-triangle">
        {ALERT_TEXT[st]}
      </Banner>
      <button type="button" className="sk-link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
        Details
        <Icon name={details ? "chevron-up" : "chevron-down"} size={13} />
      </button>
      {details && (
        <code>
          {st === "offline" ? "app-not-running" : "token-rejected"} · 127.0.0.1:{port}
          {!health?.ok && health?.detail ? ` · ${health.detail}` : ""}
        </code>
      )}
    </div>
  );
}

function PortField({ port, upd }: Pick<Props, "upd"> & { port: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && validPort(n)) upd((x) => ({ ...x, port: n }));
    setDraft(null);
  };
  const bad = draft !== null && !validPort(Number(draft));
  return (
    <div className="op-field">
      <label className="lm-field__label" htmlFor="port">
        Port
      </label>
      <p>Must match the desktop app. Loopback only; nothing leaves your computer.</p>
      <TextInput
        id="port"
        inputMode="numeric"
        value={draft ?? String(port)}
        error={bad ? "Use a port between 1024 and 65535." : undefined}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

function TokenTools({ token, reveal, onReveal }: { token: string; reveal: boolean; onReveal: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* blocked */
    }
  };
  return (
    <span className="op-token-tools">
      <IconButton name={reveal ? "eye-off" : "eye"} label={reveal ? "Hide token" : "Reveal token"} size={28} aria-pressed={reveal} disabled={!token} onClick={onReveal} />
      <IconButton name={copied ? "check" : "copy"} label={copied ? "Copied" : "Copy token"} size={28} disabled={!token} onClick={copy} />
    </span>
  );
}

function TokenField({ token, rejected, editor }: { token: string; rejected: boolean; editor: ReturnType<typeof useTokenEditor> }) {
  const { reveal, draft } = editor;
  return (
    <div className="op-field">
      <label className="lm-field__label" htmlFor="token">
        Pairing token
      </label>
      <p>Sent with every request so other websites can't use your voice engine.</p>
      <div className="lm-field">
        <div className={`lm-input ${rejected ? "is-error" : ""}`}>
          <input
            id="token"
            ref={editor.ref}
            className="lm-input__field"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the new token here"
            aria-invalid={rejected}
            value={editor.value}
            onFocus={(e) => {
              if (!reveal && draft === null && token) e.currentTarget.select();
            }}
            onChange={(e) => editor.setDraft(e.target.value)}
            onBlur={editor.commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {!rejected && <TokenTools token={token} reveal={reveal} onReveal={editor.toggleReveal} />}
        </div>
        {rejected && <div className="lm-field__error">Token rejected. Copy a new one from Speak Kit &gt; Settings &gt; Browser integration.</div>}
      </div>
    </div>
  );
}

/** Options "Desktop app connection": status, test, open/download the app, port and pairing token (C1 to C3). */
export function ConnectionCard({ s, upd, health, refresh, token, setToken }: Props) {
  const st = connState(health);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const rejected = st === "token";
  const editor = useTokenEditor({ token, setToken, test, rejected });
  return (
    <section className="lm-card op-card" aria-labelledby="conn-h">
      <h2 id="conn-h">Desktop app connection</h2>
      <ConnStatus st={st} ok={st === "ok" && health?.ok ? health : null} busy={busy} onTest={test} onRepair={editor.repair} onPaste={editor.paste} refresh={refresh} />
      {(st === "offline" || st === "token") && <ConnAlert st={st} port={s.port} health={health} />}
      <div className="op-two">
        <PortField port={s.port} upd={upd} />
        <TokenField token={token} rejected={rejected} editor={editor} />
      </div>
    </section>
  );
}
