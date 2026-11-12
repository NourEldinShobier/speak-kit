import { requestOpen } from "./features/meetings";
import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type { AppState, Page, SettingsSub, UiEvent } from "../shared/ipc";
import { ExportDialog } from "./features/export";
import { Palette, runCommand } from "./features/palette";
import { QuitDialog } from "./QuitDialog";
import { Settings } from "./settings";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { UpdatingCard } from "./UpdateCard";
import { useMotionPreference } from "./features/settings";
import { StartupState, Wizard } from "./features/wizard";
import { LocaleProvider, useT } from "./i18n";
import { PAGE_REGISTRY } from "./page-registry";
import { PreviewCtx } from "./pages";
import { currentLoc, initShell, shellReducer, recentReadings, type OpenDoc, type RecentReading, type ShellAction, type ShellState } from "./shell-model";
import { api, useAppState, usePreview, useVisible } from "./ui";

export function App() {
  const s = useAppState();
  useVisible();
  useEffect(() => {
    if (s?.platform) document.documentElement.dataset.platform = s.platform;
  }, [s?.platform]);
  return (
    <div className="lm" style={{ height: "100%" }}>
      {!s && <StartupState />}
      {s && (s.config.setupDone ? <Shell s={s} /> : <Wizard s={s} />)}
    </div>
  );
}

/** The readings opened most recently; read again when the open reading or the page changes. */
function useRecent(refresh: unknown): RecentReading[] {
  const [recent, setRecent] = useState<RecentReading[]>([]);
  useEffect(() => {
    let live = true;
    window.speakkitLibrary?.list().then(
      (docs) => live && setRecent(recentReadings(docs)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [refresh]);
  return recent;
}

/** The page for the current location, looked up in the page registries. */
function PageView({ s, page, sub, doc, dispatch }: { s: AppState; page: Page; sub: SettingsSub; doc: OpenDoc | null; dispatch: Dispatch<ShellAction> }) {
  if (page === "settings") return <Settings s={s} sub={sub} />;
  const Body = PAGE_REGISTRY[page];
  return <Body s={s} dispatch={dispatch} doc={doc} />;
}

function useShellEvents(dispatch: Dispatch<ShellAction>, halt: () => void) {
  const haltRef = useRef(halt);
  haltRef.current = halt;
  useEffect(
    () =>
      api.onUi((e: UiEvent) => {
        if (e.type === "nav") dispatch({ type: "go", page: e.page, ...(e.sub ? { sub: e.sub } : {}) });
        else if (e.type === "open-meeting") {
          requestOpen(e.id);
          dispatch({ type: "go", page: "history" });
        } else if (e.type === "confirm-quit") dispatch({ type: "quit", open: true });
        else if (e.type === "export") dispatch({ type: "export", open: { text: e.text ?? "" } });
        else if (e.type === "pause") haltRef.current();
      }),
    [dispatch],
  );
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch({ type: "toggle-palette" });
      }
      // Escape leaves Settings unless it was meant for an open dialog, menu, list or text field.
      const t = e.target instanceof HTMLElement ? e.target : null;
      const busy = e.defaultPrevented || t?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]');
      if (e.key === "Escape" && !busy) dispatch({ type: "close-settings" });
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [dispatch]);
}

function Overlays({ s, st, dispatch, player }: { s: AppState; st: ShellState; dispatch: Dispatch<ShellAction>; player: ReturnType<typeof usePreview> }) {
  return (
    <>
      {st.palette && (
        <Palette onRun={(c) => runCommand(c, { s, dispatch, halt: player.halt, preview: (v, t) => void player.toggle(v, t) })} onClose={() => dispatch({ type: "palette", open: false })} />
      )}
      {st.exporting && <ExportDialog s={s} open={st.exporting} onClose={() => dispatch({ type: "export", open: null })} />}
      <QuitDialog s={s} open={st.quit} playing={!!player.playing} onClose={() => dispatch({ type: "quit", open: false })} />
    </>
  );
}

function DocumentLanguage() {
  const { locale } = useT();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

function Shell({ s }: { s: AppState }) {
  useMotionPreference(s.config.reduceMotion);
  const player = usePreview(s.config.speed);
  const [st, dispatch] = useReducer(shellReducer, undefined, initShell);
  const { page, sub } = currentLoc(st);
  useShellEvents(dispatch, player.halt);
  const recent = useRecent(`${page}:${st.doc?.id ?? ""}`);

  return (
    <LocaleProvider choice={s.config.language}>
      <PreviewCtx.Provider value={player}>
        <DocumentLanguage />
        <div className="sk-app">
          <TitleBar
            s={s}
            canBack={st.at > 0}
            canFwd={st.at < st.hist.length - 1}
            onBack={() => dispatch({ type: "back" })}
            onFwd={() => dispatch({ type: "forward" })}
            onToggleSide={() => dispatch({ type: "toggle-side" })}
            onSearch={() => dispatch({ type: "palette", open: true })}
          />
          <div className="sk-body">
            <Sidebar
              s={s}
              hidden={!st.side}
              page={page}
              sub={sub}
              recent={recent}
              go={(p, sb) => dispatch({ type: "go", page: p, ...(sb ? { sub: sb } : {}) })}
              onCloseSettings={() => dispatch({ type: "close-settings" })}
              onOpenRecent={(id) => {
                dispatch({ type: "go", page: "library" });
                dispatch({ type: "open-doc", doc: { id, autoplay: false } });
              }}
              onOpenExport={(jobId) => dispatch({ type: "export", open: { text: "", jobId } })}
            />
            <main className="sk-main">
              <PageView s={s} page={page} sub={sub} doc={st.doc} dispatch={dispatch} />
            </main>
          </div>
          <Overlays s={s} st={st} dispatch={dispatch} player={player} />
          <UpdatingCard s={s} />
        </div>
      </PreviewCtx.Provider>
    </LocaleProvider>
  );
}
