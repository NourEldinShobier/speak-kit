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

/** Options "Desktop app connection": status, test, open/download the app, port and pairing token (C1 to C3). */
export function ConnectionCard({ s, upd, health, refresh, token, setToken }: Props) {
  const st = connState(health);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [portDraft, setPortDraft] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);
  const rejected = st === "token";

  const test = async () => {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const commitToken = async () => {
    const v = (draft ?? "").trim();
    setDraft(null);
    if (v && v !== token) {
      setToken(v);
      await test();
    }
  };
  const repair = () => {
    setReveal(false);
    setDraft("");
    setTimeout(() => tokenRef.current?.focus(), 0);
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* blocked */
    }
  };
  const commitPort = () => {
    const n = Number(portDraft);
    if (portDraft !== null && validPort(n)) upd((x) => ({ ...x, port: n }));
    setPortDraft(null);
  };
  const launch = async () => {
    setLaunching(true);
    try {
      await send({ t: "launch-app" });
      await refresh();
    } finally {
      setLaunching(false);
    }
  };
  const portBad = portDraft !== null && !validPort(Number(portDraft));

  const ok = st === "ok" && health?.ok ? health : null;
  const title = ok ? `Connected to SpeakKit ${ok.health.version}` : st === "token" ? "Pairing token rejected" : st === "offline" ? "SpeakKit isn't running" : "Checking connection";
  const sub = ok
    ? `${engineText(ok.health.engine.state, ok.health.engine.progress)} · answered in ${ok.ms} ms`
    : st === "token" ? "This browser's token doesn't match the app."
    : st === "offline" ? "Nothing is answering on this computer." : "Looking for SpeakKit on this computer.";
  // rejected token: an empty, focused field waiting for the new one (C3)
  const tokenValue = draft ?? (rejected ? "" : reveal ? token : maskToken(token));
  useEffect(() => {
    if (rejected) tokenRef.current?.focus();
  }, [rejected]);

  return (
    <section className="lm-card op-card" aria-labelledby="conn-h">
      <h2 id="conn-h">Desktop app connection</h2>
      <div className="op-conn" data-state={st}>
        <div className="op-conn-l">
          <span className={`op-conn-ic ${ok ? "ok" : st === "checking" ? "" : "err"}`}>
            <Icon name={ok ? "check" : st === "checking" ? "loader-2" : "x"} size={20} className={st === "checking" ? "lm-spin" : undefined} />
          </span>
          <div>
            <div className="op-conn-t" role="status">{title}</div>
            <div className="op-conn-s">{sub}</div>
          </div>
        </div>
        <div className="op-conn-r">
          <Button variant={ok ? "secondary" : "ghost"} iconLeft="refresh" onClick={test} disabled={busy}>{busy ? "Testing…" : "Test connection"}</Button>
          {st === "offline" && (
            <>
              <Button iconLeft="download" onClick={() => openUrl(LINKS.download)}>Download app</Button>
              <Button variant="primary" iconLeft="external-link" loading={launching} onClick={launch}>Open SpeakKit</Button>
            </>
          )}
          {st === "token" && (
            <>
              <Button iconLeft="link" onClick={repair}>Re-pair</Button>
              <Button variant="primary" iconLeft="clipboard" onClick={paste}>Paste new token</Button>
            </>
          )}
          {st === "ok" && <Button iconLeft="link" onClick={repair}>Re-pair</Button>}
        </div>
      </div>
      {(st === "offline" || st === "token") && (
        <div className="op-alert" role="alert">
          <Banner tone="warning" icon="alert-triangle">
            {st === "offline"
              ? "Open SpeakKit and this page reconnects by itself. If it doesn't, download the app first."
              : "SpeakKit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch."}
          </Banner>
          <button type="button" className="sk-link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            Details<Icon name={details ? "chevron-up" : "chevron-down"} size={13} />
          </button>
          {details && <code>{st === "offline" ? "app-not-running" : "token-rejected"} · 127.0.0.1:{s.port}{!health?.ok && health?.detail ? ` · ${health.detail}` : ""}</code>}
        </div>
      )}
      <div className="op-two">
        <div className="op-field">
          <label className="lm-field__label" htmlFor="port">Port</label>
          <p>Must match the desktop app. Loopback only; nothing leaves your computer.</p>
          <TextInput
            id="port"
            inputMode="numeric"
            value={portDraft ?? String(s.port)}
            error={portBad ? "Use a port between 1024 and 65535." : undefined}
            onChange={(e) => setPortDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={commitPort}
            onKeyDown={(e) => e.key === "Enter" && commitPort()}
          />
        </div>
        <div className="op-field">
          <label className="lm-field__label" htmlFor="token">Pairing token</label>
          <p>Sent with every request so other websites can't use your voice engine.</p>
          <div className="lm-field">
            <div className={`lm-input ${rejected ? "is-error" : ""}`}>
              <input
                id="token"
                ref={tokenRef}
                className="lm-input__field"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the new token here"
                aria-invalid={rejected}
                value={tokenValue}
                onFocus={(e) => { if (!reveal && draft === null && token) e.currentTarget.select(); }}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitToken}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              {!rejected && (
                <span className="op-token-tools">
                  <IconButton name={reveal ? "eye-off" : "eye"} label={reveal ? "Hide token" : "Reveal token"} size={28} aria-pressed={reveal} disabled={!token} onClick={() => setReveal((r) => !r)} />
                  <IconButton name={copied ? "check" : "copy"} label={copied ? "Copied" : "Copy token"} size={28} disabled={!token} onClick={copy} />
                </span>
              )}
            </div>
            {rejected && <div className="lm-field__error">Token rejected. Copy a new one from SpeakKit &gt; Settings &gt; Browser integration.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
