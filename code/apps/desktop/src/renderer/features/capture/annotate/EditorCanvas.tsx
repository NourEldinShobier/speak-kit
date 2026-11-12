import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { draw, setCrop, type Editor, type Point, type Tool } from "./model";
import { movePointer } from "./keyboard";
import { paint, type MakeSurface } from "./render";

export const makeCanvas: MakeSurface = (width, height) => Object.assign(document.createElement("canvas"), { width, height });

interface Props {
  image: HTMLImageElement;
  editor: Editor;
  tool: Tool;
  text: string;
  /** The editor after the change a gesture made. */
  onChange(next: (cur: Editor) => Editor): void;
}

interface Gesture {
  a: Point;
  b: Point;
  /** What the text tool places. */
  text?: string;
}

const applyTool = (e: Editor, tool: Tool, g: Gesture): Editor =>
  tool === "crop" ? setCrop(e, { from: g.a, to: g.b }) : draw(e, tool, { from: g.a, to: g.b, ...(g.text !== undefined && { text: g.text }) });

/** The picture with its marks, and what falls outside the crop dimmed. */
function show(canvas: HTMLCanvasElement, props: Props, gesture: Gesture | null) {
  const { image, editor, tool, text } = props;
  const live = gesture && tool !== "crop" && tool !== "text" ? applyTool(editor, tool, { ...gesture, text }) : editor;
  paint(canvas, live, { image, make: makeCanvas });
  const r = gesture && tool === "crop" ? applyTool({ ...editor, crop: undefined }, "crop", gesture).crop : editor.crop;
  const ctx = canvas.getContext("2d");
  if (!r || !ctx) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.fill("evenodd");
  ctx.strokeStyle = "#ffffff";
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.restore();
}

/** Drawing with the keyboard: arrow keys move a pointer, Space marks a corner and then the opposite one, Escape drops the corner. */
function useKeyboardDrawing(props: Props, finish: (g: Gesture) => void) {
  const { editor, tool } = props;
  const [pointer, setPointer] = useState<Point>({ x: editor.width / 2, y: editor.height / 2 });
  const [corner, setCorner] = useState<Point | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const moved = movePointer(pointer, e, editor);
    if (moved) {
      e.preventDefault();
      setPointer(moved);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (tool === "text") finish({ a: pointer, b: pointer });
      else if (corner) {
        finish({ a: corner, b: pointer });
        setCorner(null);
      } else setCorner(pointer);
    } else if (e.key === "Escape" && corner) {
      e.stopPropagation();
      setCorner(null);
    }
  };
  return { onKeyDown, preview: corner ? { a: corner, b: pointer } : null };
}

/** Draws with the pointer (drag a shape, click for text) or with the keyboard. */
export function EditorCanvas(props: Props) {
  const { editor, tool, text, onChange } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Gesture | null>(null);
  const finish = (g: Gesture) => onChange((cur) => applyTool(cur, tool, { ...g, text }));
  const keys = useKeyboardDrawing(props, finish);

  useEffect(() => {
    if (ref.current) show(ref.current, props, drag ?? keys.preview);
  });

  const at = (e: PointerEvent): Point => {
    const box = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) * editor.width) / box.width, y: ((e.clientY - box.top) * editor.height) / box.height };
  };

  return (
    <canvas
      ref={ref}
      className="cap-editor__canvas"
      width={editor.width}
      height={editor.height}
      tabIndex={0}
      aria-label={`Picture, ${editor.width} by ${editor.height}. Arrow keys move the pointer, Space marks a corner.`}
      onKeyDown={keys.onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        if (tool === "text") finish({ a: p, b: p });
        else setDrag({ a: p, b: p });
      }}
      onPointerMove={(e) => drag && setDrag({ a: drag.a, b: at(e) })}
      onPointerUp={(e) => {
        if (drag) finish({ a: drag.a, b: at(e) });
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
    />
  );
}
