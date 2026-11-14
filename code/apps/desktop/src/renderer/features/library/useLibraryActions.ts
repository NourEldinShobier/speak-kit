import { useEffect, useRef, type Dispatch, type DragEvent } from "react";
import { MAX_FILE_BYTES, type DocMeta, type ImportResult } from "../../../shared/library/contract";
import { library } from "./api";
import { errorText } from "../../error-text";
import { useT } from "../../i18n";
import type { TFn } from "../../../shared/i18n";
import type { LibraryAction } from "./page-model";

const TOAST_MS = 6000;

interface Deps {
  dispatch: Dispatch<LibraryAction>;
  refresh(): Promise<void>;
  onOpen(id: string, autoplay: boolean): void;
}

/** The toast with a timer that clears it; the timer stops when the page goes away. */
function useToast(dispatch: Dispatch<LibraryAction>) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (text: string, undo?: string) => {
    dispatch({ type: "toast", toast: { text, ...(undo ? { undo } : {}) } });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: "toast", toast: null }), TOAST_MS);
  };
}

const addedText = (doc: DocMeta, t: TFn) => t(doc.needsOcr ? "lib.addedOcr" : "lib.added", { title: doc.title });
const failureText = (r: Extract<ImportResult, { ok: false }>) => (r.name ? `${r.name}: ${errorText(r.error)}` : errorText(r.error));

function dragProps(dispatch: Dispatch<LibraryAction>, addFiles: (files: File[]) => Promise<void>) {
  return {
    onDragEnter: (e: DragEvent) => e.dataTransfer.types.includes("Files") && dispatch({ type: "drag-enter" }),
    onDragLeave: () => dispatch({ type: "drag-leave" }),
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dispatch({ type: "drag-end" });
      void addFiles([...e.dataTransfer.files]);
    },
  };
}

type Say = (text: string, undo?: string) => void;

function importer({ dispatch, refresh, say, t }: Pick<Deps, "dispatch" | "refresh"> & { say: Say; t: TFn }) {
  const finish = async (results: ImportResult[]) => {
    const added = results.flatMap((r) => (r.ok ? [r.doc] : []));
    dispatch({ type: "problems", problems: results.flatMap((r) => (r.ok ? [] : [failureText(r)])) });
    await refresh();
    if (added.length === 1) say(addedText(added[0]!, t));
    else if (added.length > 1) say(t("lib.addedMany", { n: added.length }));
  };

  const addFiles = async (files: File[]) =>
    finish(
      await Promise.all(
        files.map(async (f): Promise<ImportResult> => {
          if (f.size > MAX_FILE_BYTES) return { ok: false, reason: "too-large", name: f.name, error: { code: "dropped-file-too-large", args: { mb: MAX_FILE_BYTES / 1024 / 1024 } } };
          return library.importBytes(f.name, new Uint8Array(await f.arrayBuffer()));
        }),
      ),
    );

  return { finish, addFiles };
}

/** Everything the page does to the stored readings: import, delete and undo, open; each one ends in the reducer or a refresh. */
export function useLibraryActions({ dispatch, refresh, onOpen }: Deps) {
  const { t } = useT();
  const say = useToast(dispatch);
  const close = () => dispatch({ type: "dialog", dialog: null });

  const { finish, addFiles } = importer({ dispatch, refresh, say, t });

  const open = (d: DocMeta, play = true) => onOpen(d.id, play);

  return {
    say,
    close,
    finish,
    open,
    pickFiles: () => void library.pickFiles().then(finish),
    dragProps: dragProps(dispatch, addFiles),
    remove: async (doc: DocMeta) => {
      close();
      await library.remove(doc.id);
      await refresh();
      say(t("lib.deleted", { title: doc.title }), doc.id);
    },
    undo: async (id: string) => {
      dispatch({ type: "toast", toast: null });
      await library.restore(id);
      await refresh();
    },
    addedPasted: async (doc: DocMeta, play: boolean) => {
      close();
      await refresh();
      if (play) open(doc);
      else say(t("lib.added", { title: doc.title }));
    },
    addedUrl: (doc: DocMeta) => {
      close();
      void refresh();
      say(t("lib.added", { title: doc.title }));
    },
    changed: () => {
      close();
      void refresh();
    },
  };
}
