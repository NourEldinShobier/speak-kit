import { useEffect, useReducer, useRef, type Dispatch } from "react";
import type { AppState, Page, SettingsSub, UiEvent } from "../shared/ipc";
import { EnginesPage } from "./features/engines";
import { VoicesPage } from "./features/voices";
import { ExportDialog } from "./features/export";
import { LibraryPage } from "./features/library";
import { Reader } from "./features/reader";
import { Palette, runCommand } from "./features/palette";
import { QuitDialog } from "./QuitDialog";
import { NewReading } from "./NewReading";
import { Settings } from "./settings";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { UpdatingCard } from "./UpdateCard";
import { Wizard } from "./features/wizard";
import { BrowserPage } from "./BrowserPage";
import { Home } from "./HomePage";
import { PreviewCtx } from "./pages";
import { currentLoc, initShell, shellReducer, type OpenDoc, type ShellAction, type ShellState } from "./shell-model";
import { api, useAppState, usePreview, useVisible } from "./ui";

export function App() {
  const s = useAppState();
  useVisible();
  useEffect(() => {
    if (s?.platform) document.documentElement.dataset.platform = s.platform;
  }, [s?.platform]);
  return (
    <div className="lm" style={{ height: "100%" }}>
      {s && (s.config.setupDone ? <Shell s={s} /> : <Wizard s={s} />)}
    </div>
  );
}

const RECENT_KEY = "speakkit.recent";
const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
};
const saveRecent = (recent: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* private mode: recent list is just not remembered */
  }
};

/** The page for the current location. The library page and the reader share one route: opening a reading swaps the list for the reader. */
function PageView({ s, page, sub, doc, dispatch }: { s: AppState; page: Page; sub: SettingsSub; doc: OpenDoc | null; dispatch: Dispatch<ShellAction> }) {
  const go = (p: "engines" | "browser") => dispatch({ type: "go", page: p });
  switch (page) {
    case "home":
      return <Home s={s} go={go} />;
    case "library":
      return doc ? (
        <Reader
          key={doc.id}
          s={s}
          id={doc.id}
          autoplay={doc.autoplay}
          onBack={() => dispatch({ type: "open-doc", doc: null })}
          onExport={(text, name) => dispatch({ type: "export", open: { text, name } })}
        />
      ) : (
        <LibraryPage s={s} onOpen={(id, autoplay) => dispatch({ type: "open-doc", doc: { id, autoplay } })} />
      );
    case "voices":
      return <VoicesPage s={s} onGo={go} />;
    case "engines":
      return <EnginesPage s={s} />;
    case "browser":
      return <BrowserPage s={s} />;
    case "settings":
      return <Settings s={s} sub={sub} />;
    default: {
      const unreachable: never = page;
      return unreachable;
    }
  }
}

function useShellEvents(dispatch: Dispatch<ShellAction>, halt: () => void) {
  const haltRef = useRef(halt);
  haltRef.current = halt;
  useEffect(
    () =>
      api.onUi((e: UiEvent) => {
        if (e.type === "nav") dispatch({ type: "go", page: e.page, ...(e.sub ? { sub: e.sub } : {}) });
        else if (e.type === "confirm-quit") dispatch({ type: "quit", open: true });
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
  const closeReading = () => {
    player.halt();
    dispatch({ type: "close-reading" });
  };
  return (
    <>
      {st.palette && (
        <Palette onRun={(c) => runCommand(c, { s, dispatch, halt: player.halt, preview: (v, t) => void player.toggle(v, t) })} onClose={() => dispatch({ type: "palette", open: false })} />
      )}
      {st.reading !== null && (
        <NewReading
          s={s}
          initial={st.reading}
          onClose={closeReading}
          onRead={(text) => dispatch({ type: "remember", text })}
          onExport={(text) => {
            closeReading();
            dispatch({ type: "export", open: { text } });
          }}
        />
      )}
      {st.exporting && <ExportDialog s={s} open={st.exporting} onClose={() => dispatch({ type: "export", open: null })} />}
      <QuitDialog s={s} open={st.quit} playing={!!player.playing} onClose={() => dispatch({ type: "quit", open: false })} />
    </>
  );
}

function Shell({ s }: { s: AppState }) {
  const player = usePreview(s.config.speed);
  const [st, dispatch] = useReducer(shellReducer, undefined, () => initShell(loadRecent()));
  const { page, sub } = currentLoc(st);
  useShellEvents(dispatch, player.halt);
  useEffect(() => saveRecent(st.recent), [st.recent]);

  return (
    <PreviewCtx.Provider value={player}>
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
            recent={st.recent}
            go={(p, sb) => dispatch({ type: "go", page: p, ...(sb ? { sub: sb } : {}) })}
            onCloseSettings={() => dispatch({ type: "close-settings" })}
            onNewReading={(text) => dispatch({ type: "open-reading", text })}
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
  );
}
