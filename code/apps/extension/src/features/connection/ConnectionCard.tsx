import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@speakkit/ui";
import { maskToken, usePort } from "../settings";
import { send, type HealthResult } from "../../shared/client";
import { ConnAlert } from "./ConnAlert";
import { engineText } from "./errors";
import { connState } from "./hooks";
import { LINKS, openUrl } from "../../shared/links";

interface Props {
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

/** The text of the status line; `ok` is the health answer when connected. */
function statusText(st: ConnState, ok: Connected | null): { title: string; sub: string } {
  if (ok) return { title: `Connected to Speak Kit ${ok.health.version}`, sub: `${engineText(ok.health.engine.state, ok.health.engine.progress)} · answered in ${ok.ms} ms` };
  return STATUS_TEXT[st === "ok" ? "checking" : st];
}

const STATUS_ICON = { ok: "check", checking: "loader-2", offline: "x", token: "x" } as const;
const STATUS_CLASS = { ok: "ok", checking: "", offline: "err", token: "err" } as const;

/** The pairing step: the saved token shows masked; a pasted one is saved when the field is left or Enter is pressed, then the connection is tested. */
function useTokenEditor({ token, setToken, test, rejected }: { token: string; setToken: (t: string) => void; test: () => Promise<void>; rejected: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rejected) ref.current?.focus();
  }, [rejected]);
  const commit = async () => {
    const v = (draft ?? "").trim();
    setDraft(null);
    if (v && v !== token) {
      setToken(v);
      await test();
    }
  };
  // A rejected token shows an empty, focused field waiting for the new one.
  const value = draft ?? (rejected ? "" : maskToken(token));
  return { ref, setDraft, value, draft, commit };
}

interface StatusProps {
  st: ConnState;
  ok: Connected | null;
  busy: boolean;
  onTest: () => void;
  refresh: () => Promise<HealthResult>;
}

function ConnActions({ st, ok, busy, onTest, refresh }: StatusProps) {
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

function TokenField({ token, rejected, editor }: { token: string; rejected: boolean; editor: ReturnType<typeof useTokenEditor> }) {
  return (
    <div className="op-field">
      <label className="lm-field__label" htmlFor="token">
        Pairing token
      </label>
      <p>Copy it from Speak Kit &gt; Settings &gt; Browser integration and paste it here. It keeps other websites from using your voice engine.</p>
      <div className="lm-field">
        <div className={`lm-input ${rejected ? "is-error" : ""}`}>
          <input
            id="token"
            ref={editor.ref}
            className="lm-input__field"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the token here"
            aria-invalid={rejected}
            value={editor.value}
            onFocus={(e) => {
              if (editor.draft === null && token) e.currentTarget.select();
            }}
            onChange={(e) => editor.setDraft(e.target.value)}
            onBlur={editor.commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
        {rejected && <div className="lm-field__error">Token rejected. Copy a new one from Speak Kit &gt; Settings &gt; Browser integration.</div>}
      </div>
    </div>
  );
}

/** Options "Desktop app connection": status, test, open/download the app and the pairing token. */
export function ConnectionCard({ health, refresh, token, setToken }: Props) {
  const st = connState(health);
  const port = usePort();
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
      <ConnStatus st={st} ok={st === "ok" && health?.ok ? health : null} busy={busy} onTest={test} refresh={refresh} />
      {(st === "offline" || st === "token") && <ConnAlert st={st} port={port} health={health} />}
      <div className="op-pair">
        <TokenField token={token} rejected={rejected} editor={editor} />
      </div>
    </section>
  );
}
