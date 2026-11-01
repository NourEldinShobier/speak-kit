import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  IconButton,
  Icon,
  Kbd,
  Modal,
  NavItem,
  NavSection,
  Popover,
  Select,
  SidebarNav,
  StatusPill,
} from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState, Page, SettingsSub, UiEvent } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import type { Command } from "../shared/palette";
import { api, Logo, useAppState, usePreview, useVisible } from "./ui";
import { BrowserPage, Engines, Home, PreviewCtx, usePlayer, Voices } from "./pages";
import { Settings, SETTINGS_NAV } from "./settings";
import { Palette } from "./Palette";
import { Wizard } from "./Wizard";

interface Loc {
  page: Page;
  sub: SettingsSub;
}

export function App() {
  const s = useAppState();
  useVisible();
  useEffect(() => {
    const t = s?.config.theme;
    if (!t || t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [s?.config.theme]);
  return <div className="lm" style={{ height: "100%" }}>{!s ? null : s.config.setupDone ? <Shell s={s} /> : <Wizard s={s} />}</div>;
}

const NAV: { page: Exclude<Page, "settings">; label: string; icon: "home" | "microphone" | "cpu" | "world" }[] = [
  { page: "home", label: "Home", icon: "home" },
  { page: "voices", label: "Voices", icon: "microphone" },
  { page: "engines", label: "Engines", icon: "cpu" },
  { page: "browser", label: "Browser", icon: "world" },
];

const RECENT_KEY = "speakkit.recent";
const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
};

function Shell({ s }: { s: AppState }) {
  const player = usePreview(s.config.speed);
  const [hist, setHist] = useState<Loc[]>([{ page: "home", sub: "general" }]);
  const [at, setAt] = useState(0);
  const [side, setSide] = useState(true);
  const [pal, setPal] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [quit, setQuit] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const loc = hist[at]!;

  const go = useCallback(
    (page: Page, sub?: SettingsSub) => {
      const cur = hist[at]!;
      const next: Loc = { page, sub: sub ?? (page === "settings" ? cur.sub : "general") };
      if (cur.page === next.page && cur.sub === next.sub) return;
      setHist([...hist.slice(0, at + 1), next]);
      setAt(at + 1);
    },
    [hist, at],
  );

  const goRef = useRef(go);
  goRef.current = go;
  const haltRef = useRef(player.halt);
  haltRef.current = player.halt;
  useEffect(
    () =>
      api.onUi((e: UiEvent) => {
        if (e.type === "nav") goRef.current(e.page, e.sub);
        else if (e.type === "confirm-quit") setQuit(true);
        else haltRef.current();
      }),
    [],
  );
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPal((p) => !p);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const run = (c: Command) => {
    setPal(false);
    const a = c.action;
    if (a.type === "nav") go(a.page, a.sub);
    else if (a.type === "new-reading") setReading("");
    else if (a.type === "pause") player.halt();
    else if (a.type === "copy-token") void api.copy(s.token);
    else if (a.type === "open-logs") void api.openPath("logs");
    else void player.toggle(a.voice, `Hello, this is ${c.title.replace("Preview ", "")}.`);
  };

  const saveRecent = (text: string) => {
    const t = text.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!t) return;
    const next = [t, ...recent.filter((r) => r !== t)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode: recent list is just not remembered */
    }
  };

  const inSettings = loc.page === "settings";
  return (
    <PreviewCtx.Provider value={player}>
      <div className="sk-app">
        <TitleBar
          s={s}
          canBack={at > 0}
          canFwd={at < hist.length - 1}
          onBack={() => setAt(at - 1)}
          onFwd={() => setAt(at + 1)}
          onToggleSide={() => setSide(!side)}
          onSearch={() => setPal(true)}
        />
        <div className="sk-body">
          <aside className="sk-side" hidden={!side}>
            {inSettings ? (
              <SidebarNav label="Settings">
                <div className="sk-side__head">
                  <IconButton name="arrow-left" label="Back" size={28} onClick={() => setAt(Math.max(0, at - 1))} />
                  <span className="sk-side__label">Settings</span>
                </div>
                {SETTINGS_NAV.map((g) => (
                  <div key={g.group} style={{ display: "contents" }}>
                    <NavSection>{g.group}</NavSection>
                    {g.items.map((it) => (
                      <NavItem
                        key={it.id}
                        icon={it.icon}
                        href={`#settings-${it.id}`}
                        selected={loc.sub === it.id}
                        onClick={(e) => {
                          e.preventDefault();
                          go("settings", it.id);
                        }}
                      >
                        {it.label}
                      </NavItem>
                    ))}
                  </div>
                ))}
              </SidebarNav>
            ) : (
              <SidebarNav label="Main">
                <Button variant="primary" iconLeft="plus" onClick={() => setReading("")}>
                  <span className="sk-side__label sk-side__grow">New reading</span>
                  <Kbd small className="sk-side__label">Ctrl N</Kbd>
                </Button>
                <div style={{ height: 8 }} />
                <NavItem icon="home" href="#home" selected={loc.page === "home"} onClick={(e) => { e.preventDefault(); go("home"); }}>
                  Home
                </NavItem>
                <NavItem icon="bookmark" aria-disabled="true" tabIndex={-1} badge="v1.1">
                  Library
                </NavItem>
                {NAV.slice(1).map((n) => (
                  <NavItem key={n.page} icon={n.icon} href={`#${n.page}`} selected={loc.page === n.page} onClick={(e) => { e.preventDefault(); go(n.page); }}>
                    {n.label}
                  </NavItem>
                ))}
                <NavSection>Recent</NavSection>
                {recent.length === 0 ? (
                  <div className="sk-side__empty">Readings you start appear here.</div>
                ) : (
                  recent.map((r) => (
                    <NavItem key={r} icon="history" href="#recent" onClick={(e) => { e.preventDefault(); setReading(r); }}>
                      {r}
                    </NavItem>
                  ))
                )}
                <div className="sk-side__spacer" />
                <EngineCard s={s} />
                <NavItem icon="settings" href="#settings" onClick={(e) => { e.preventDefault(); go("settings", "general"); }}>
                  Settings
                </NavItem>
              </SidebarNav>
            )}
          </aside>
          <main className="sk-main">
            {loc.page === "home" && <Home s={s} go={go} />}
            {loc.page === "voices" && <Voices s={s} />}
            {loc.page === "engines" && <Engines s={s} />}
            {loc.page === "browser" && <BrowserPage s={s} />}
            {inSettings && <Settings s={s} sub={loc.sub} />}
          </main>
        </div>
        {pal && <Palette onRun={run} onClose={() => setPal(false)} />}
        {reading !== null && <NewReading s={s} initial={reading} onClose={() => { player.halt(); setReading(null); }} onRead={saveRecent} />}
        <QuitDialog s={s} open={quit} playing={!!player.playing} onClose={() => setQuit(false)} />
      </div>
    </PreviewCtx.Provider>
  );
}

function EngineCard({ s }: { s: AppState }) {
  const v = engineView(s.health, s.serverError);
  return (
    <div className="sk-engcard">
      <b>
        Kokoro-82M · {v.label}
      </b>
      {v.hint && <span>{v.hint}</span>}
      <span className="sk-engcard__ok">
        <Icon name="lock" size={13} />
        100% on this device
      </span>
    </div>
  );
}

function TitleBar(p: {
  s: AppState;
  canBack: boolean;
  canFwd: boolean;
  onBack(): void;
  onFwd(): void;
  onToggleSide(): void;
  onSearch(): void;
}) {
  const v = engineView(p.s.health, p.s.serverError);
  return (
    <header className="sk-title">
      <div className="sk-title__l">
        <span className="sk-brand">
          <Logo size={20} />
          SpeakKit
        </span>
        <IconButton name="layout-sidebar" label="Toggle sidebar" size={28} onClick={p.onToggleSide} />
        <IconButton name="chevron-left" label="Back" size={28} disabled={!p.canBack} onClick={p.onBack} />
        <IconButton name="chevron-right" label="Forward" size={28} disabled={!p.canFwd} onClick={p.onFwd} />
      </div>
      <button className="sk-search" onClick={p.onSearch} aria-label="Search readings, voices and commands">
        <Icon name="search" size={16} />
        <span>Search readings, voices and commands</span>
        <Kbd small>Ctrl K</Kbd>
      </button>
      <div className="sk-title__r">
        <StatusPill data-testid="engine-pill" tone={v.tone} icon={v.spinner ? "loader-2" : v.key === "unloaded" ? "moon" : undefined}>
          {v.label}
          {v.hint ? ` · ${v.hint}` : ""}
        </StatusPill>
        <Bell s={p.s} />
      </div>
    </header>
  );
}

function Bell({ s }: { s: AppState }) {
  const [seen, setSeen] = useState(0);
  const newest = s.activity[0]?.id ?? 0;
  return (
    <span className="sk-bell">
      <Popover
        title="Notifications"
        side="bottom"
        align="end"
        width={340}
        onOpenChange={(o) => o && setSeen(newest)}
        trigger={(t) => <IconButton name="bell" label="Notifications" size={28} {...t} />}
      >
        {s.activity.length === 0 ? (
          <span style={{ color: "var(--text-tertiary)" }}>All caught up.</span>
        ) : (
          <div className="sk-activity">
            {s.activity.map((a) => (
              <div key={a.id}>
                <b>{a.title}</b>
                <span>
                  {a.body} {new Date(a.atMs).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Popover>
      {newest > seen && <i className="sk-bell__dot" />}
    </span>
  );
}

function NewReading({ s, initial, onClose, onRead }: { s: AppState; initial: string; onClose(): void; onRead(text: string): void }) {
  const [text, setText] = useState(initial);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState(s.config.voice);
  const { playing, error, toggle } = usePlayer();
  useEffect(() => {
    api.voices().then((v) => setVoices(v.voices), () => {});
  }, []);
  const on = playing === "reading";
  return (
    <Modal
      open
      onClose={onClose}
      title="New reading"
      width={560}
      footer={
        <>
          <Select
            size="sm"
            label="Voice"
            value={voice}
            onChange={setVoice}
            options={voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: voice, label: voice }]}
          />
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            iconLeft={on ? "player-stop" : "player-play"}
            disabled={!text.trim()}
            onClick={() => {
              onRead(text);
              void toggle(voice, text.trim().slice(0, 5000), "reading");
            }}
          >
            {on ? "Stop" : "Read"}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">Paste or type text. It is read on this computer; nothing is uploaded.</p>
      <textarea className="sk-area" aria-label="Text to read" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text here" />
      {error && <p style={{ color: "var(--tag-red)", margin: "8px 0 0" }}>{error}</p>}
    </Modal>
  );
}

function QuitDialog({ s, open, playing, onClose }: { s: AppState; open: boolean; playing: boolean; onClose(): void }) {
  const st = s.health?.engine.state;
  const rows: [string, string][] = [
    [`Local server on 127.0.0.1:${s.port || "-"} stops`, "The browser extension cannot read until SpeakKit starts again."],
  ];
  if (playing) rows.push(["The reading in progress stops", "Start it again from the app or the extension."]);
  if (st === "downloading") rows.push(["The model download pauses", "It resumes the next time SpeakKit opens."]);
  if (st === "ready" || st === "loading") rows.push(["The voice model leaves memory", "It loads again on the next play."]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quit SpeakKit?"
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Keep running in tray</Button>
          <span style={{ flex: 1 }} />
          <Button variant="danger" solid onClick={() => api.quit()}>
            Quit
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">Closing the window keeps SpeakKit in the tray. Quitting stops:</p>
      <div className="sk-quit" data-testid="quit-list">
        {rows.map(([a, b]) => (
          <div key={a}>
            {a}
            <span>{b}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
