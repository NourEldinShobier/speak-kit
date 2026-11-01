import { memo, type MouseEvent } from "react";
import type { Block } from "../../../main/library/contract";

export interface TextClick {
  block: number;
  offset: number;
  x: number;
  y: number;
}

/** One element per block with a single text node, so highlight ranges address plain character offsets. */
export const ReaderText = memo(function ReaderText({ blocks, onPick }: { blocks: Block[]; onPick(c: TextClick): void }) {
  const click = (e: MouseEvent<HTMLElement>) => {
    if (!window.getSelection()?.isCollapsed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
    const caret = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!el || !caret || caret.startContainer !== el.firstChild) return;
    onPick({ block: Number(el.dataset.block), offset: caret.startOffset, x: e.clientX, y: e.clientY });
  };
  return (
    <div className="rd-text" onClick={click}>
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h2 key={i} data-block={i} className={`rd-h rd-h--${Math.min(b.level ?? 2, 3)}`}>{b.text}</h2>
        ) : b.kind === "quote" ? (
          <blockquote key={i} data-block={i} className="rd-quote">{b.text}</blockquote>
        ) : (
          <p key={i} data-block={i} className={b.kind === "list-item" ? "rd-item" : undefined}>{b.text}</p>
        ),
      )}
    </div>
  );
});
