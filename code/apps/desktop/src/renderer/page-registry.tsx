/**
 * Page registry: ONE line per route id. To mount a feature page, build it under renderer/features/<name>/ (public interface in index.ts)
 * and replace that route's `StubPage` line below. Nothing else in the shell changes. Settings pages have their own registry in settings.tsx.
 */
import { lazy, Suspense, type ComponentType, type Dispatch } from "react";
import type { AppState } from "../shared/ipc";
import { CapturePage } from "./features/capture";
import { EnginesPage } from "./features/engines";
import { LibraryPage } from "./features/library";
import { Reader } from "./features/reader";
import { VoiceChatPage } from "./features/voice-chat";
import { VoicesPage } from "./features/voices";
import { Home } from "./HomePage";
import type { MenuPage } from "./routes";
import type { OpenDoc, ShellAction } from "./shell-model";
import { StubPage } from "./StubPage";

export interface PageProps {
  s: AppState;
  dispatch: Dispatch<ShellAction>;
  /** The reading open in the library, if any. */
  doc: OpenDoc | null;
}

// Dictation is rarely opened: its pages, styles and code load on first use.
const DictationPage = lazy(() => import("./features/dictation").then((m) => ({ default: m.DictationPage })));
// History holds the dictation history and the transcripts; it is rarely opened too.
const HistoryPage = lazy(() => import("./features/transcripts").then((m) => ({ default: m.HistoryRoute })));
const later = (node: React.ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

/** The library list and the reader share one route: opening a reading swaps the list for the reader. */
function LibraryRoute({ s, dispatch, doc }: PageProps) {
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
}

export const PAGE_REGISTRY: Record<MenuPage, ComponentType<PageProps>> = {
  home: ({ s, dispatch }) => <Home s={s} go={(p) => dispatch(p === "engines" ? { type: "go", page: "engines" } : { type: "go", page: "settings", sub: "browser" })} />,
  library: LibraryRoute,
  voices: ({ s }) => <VoicesPage s={s} />,
  "voice-chat": ({ s }) => <VoiceChatPage s={s} />,
  engines: ({ s }) => <EnginesPage s={s} />,
  dictation: ({ dispatch }) => later(<DictationPage openHistory={() => dispatch({ type: "go", page: "history" })} />),
  modes: () => <StubPage page="modes" />,
  vocabulary: () => <StubPage page="vocabulary" />,
  history: ({ dispatch }) => later(<HistoryPage openSettings={() => dispatch({ type: "go", page: "settings", sub: "storage" })} />),
  capture: () => later(<CapturePage />),
};
