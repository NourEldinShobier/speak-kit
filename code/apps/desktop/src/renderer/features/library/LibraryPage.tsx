import { useMemo, useReducer } from "react";
import { Icon, Toast } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { useT } from "../../i18n";
import { DeleteDialog, RenameDialog } from "./ItemDialogs";
import { LibraryBody } from "./LibraryBody";
import { LibraryHead, ProblemsBanner } from "./LibraryHead";
import { PasteDialog } from "./PasteDialog";
import { UrlDialog } from "./UrlDialog";
import { initLibraryUi, libraryReducer, libraryView, type LibraryAction, type LibraryUi } from "./page-model";
import { useDocs, useSearch } from "./useLibrary";
import { useLibraryActions } from "./useLibraryActions";
import "./library.css";

type Actions = ReturnType<typeof useLibraryActions>;

interface DialogsProps {
  ui: LibraryUi;
  s: AppState;
  actions: Actions;
  dispatch: (a: LibraryAction) => void;
}

function Dialogs({ ui, s, actions, dispatch }: DialogsProps) {
  const d = ui.dialog;
  const doc = (kind: "rename" | "delete") => (d?.kind === kind ? d.doc : null);
  return (
    <>
      <PasteDialog open={d?.kind === "paste"} speed={s.config.speed} onClose={actions.close} onAdded={(x, p) => void actions.addedPasted(x, p)} />
      <UrlDialog open={d?.kind === "url"} onClose={actions.close} onAdded={actions.addedUrl} onPasteInstead={() => dispatch({ type: "dialog", dialog: { kind: "paste" } })} />
      <RenameDialog key={`r${doc("rename")?.id ?? ""}`} doc={doc("rename")} onClose={actions.close} onDone={actions.changed} />
      <DeleteDialog doc={doc("delete")} onClose={actions.close} onConfirm={() => d?.kind === "delete" && void actions.remove(d.doc)} />
    </>
  );
}

export function LibraryPage({ s, onOpen }: { s: AppState; onOpen(id: string, autoplay: boolean): void }) {
  const { docs, now, refresh } = useDocs();
  const [ui, dispatch] = useReducer(libraryReducer, undefined, initLibraryUi);
  const hits = useSearch(ui.query, docs);
  const actions = useLibraryActions({ dispatch, refresh, onOpen });
  const speed = s.config.speed;
  const view = useMemo(() => libraryView(docs, { query: ui.query, filter: ui.filter, sort: ui.sort, hits, speed }), [docs, ui.query, ui.filter, ui.sort, hits, speed]);
  const { toast } = ui;
  const { t } = useT();
  return (
    <div className="lib-wrap" {...actions.dragProps}>
      <div className="lib" data-testid="library">
        <LibraryHead loaded={docs !== null} view={view} query={ui.query} dispatch={dispatch} pickFiles={actions.pickFiles} />
        <ProblemsBanner problems={ui.problems} dispatch={dispatch} />
        <LibraryBody loaded={docs !== null} ui={ui} view={view} hits={hits} speed={speed} now={now} dispatch={dispatch} pickFiles={actions.pickFiles} open={actions.open} refresh={refresh} />
      </div>
      {ui.dragging > 0 && (
        <div className="lib-drop" data-testid="drop-overlay" aria-live="polite">
          <Icon name="upload" size={32} />
          <strong>{t("lib.drop")}</strong>
          <span>{t("lib.dropTypes")}</span>
        </div>
      )}
      <Dialogs ui={ui} s={s} actions={actions} dispatch={dispatch} />
      {toast && (
        <div className="lib-toast">
          <Toast tone="success" action={toast.undo ? { label: t("lib.undo"), onClick: () => void actions.undo(toast.undo!) } : undefined}>
            {toast.text}
          </Toast>
        </div>
      )}
    </div>
  );
}
