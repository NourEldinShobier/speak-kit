import { useEffect, useState } from "react";
import { Banner, Button, Modal } from "@speakkit/ui";
import type { EditSource } from "../../../../shared/capture/contract";
import { EditorCanvas, makeCanvas } from "./EditorCanvas";
import { shortcutOf } from "./keyboard";
import { canRedo, canUndo, exportRect, isEdited, newEditor, redo, TOOLS, undo, type Editor, type Tool } from "./model";
import { exportSurface } from "./render";

const LABEL: Record<Tool, string> = { arrow: "Arrow", rect: "Rectangle", text: "Text", highlight: "Highlight", blur: "Blur", crop: "Crop" };

interface Props {
  source: EditSource;
  /** Called with the PNG of the finished picture; resolves false when it could not be saved. */
  onSave(png: Uint8Array): Promise<boolean>;
  onClose(): void;
}

function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = src;
  }, [src]);
  return img;
}

/** Saving: the picture is painted with its marks, cut to the crop and handed over as a PNG. A failure leaves the editor open. */
function useSave(img: HTMLImageElement | null, editor: Editor, p: Pick<Props, "onSave" | "onClose">) {
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const run = async () => {
    if (!img) return;
    setState("saving");
    try {
      const out = exportSurface(editor, { image: img, make: makeCanvas });
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
      const ok = blob ? await p.onSave(new Uint8Array(await blob.arrayBuffer())) : false;
      if (ok) p.onClose();
      else setState("failed");
    } catch {
      setState("failed");
    }
  };
  return { state, run };
}

function Toolbar({ tool, setTool, editor, set }: { tool: Tool; setTool(t: Tool): void; editor: Editor; set(f: (e: Editor) => Editor): void }) {
  return (
    <div className="cap-editor__tools" role="toolbar" aria-label="Editing tools">
      {TOOLS.map((t) => (
        <Button key={t} aria-pressed={tool === t} className={tool === t ? "cap-editor__on" : undefined} onClick={() => setTool(t)}>
          {LABEL[t]}
        </Button>
      ))}
      <Button disabled={!canUndo(editor)} onClick={() => set(undo)}>
        Undo
      </Button>
      <Button disabled={!canRedo(editor)} onClick={() => set(redo)}>
        Redo
      </Button>
    </div>
  );
}

/** Edits one picture: arrow, rectangle, text, highlight, blur and crop, with undo and redo. */
export function AnnotateEditor({ source, onSave, onClose }: Props) {
  const img = useImage(source.src);
  const [editor, setEditor] = useState(() => newEditor(source.width, source.height));
  const [tool, setTool] = useState<Tool>("arrow");
  const [text, setText] = useState("");
  const save = useSave(img, editor, { onSave, onClose });
  const crop = exportRect(editor);
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!isEdited(editor) || !img} loading={save.state === "saving"} onClick={() => void save.run()}>
        Save a copy
      </Button>
    </>
  );
  return (
    <Modal open onClose={onClose} title="Edit picture" width={920} footer={footer}>
      <div
        className="cap-editor"
        onKeyDown={(e) => {
          const s = shortcutOf(e);
          if (!s) return;
          e.preventDefault();
          setEditor(s === "undo" ? undo : redo);
        }}
      >
        <Toolbar tool={tool} setTool={setTool} editor={editor} set={setEditor} />
        {tool === "text" ? (
          <label className="cap-editor__text">
            <span>Text to place</span>
            <input className="lm-input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Type, then click the picture" />
          </label>
        ) : null}
        {save.state === "failed" ? (
          <Banner tone="error" title="The copy was not saved">
            Nothing was changed. Try again.
          </Banner>
        ) : null}
        {img ? (
          <EditorCanvas image={img} editor={editor} tool={tool} text={text} onChange={setEditor} />
        ) : (
          <p className="cap-detail__meta" role="status">
            Loading the picture
          </p>
        )}
        <p className="cap-detail__meta">{editor.crop ? `Crop ${Math.round(crop.width)} by ${Math.round(crop.height)}` : `${source.width} by ${source.height}`}</p>
      </div>
    </Modal>
  );
}
