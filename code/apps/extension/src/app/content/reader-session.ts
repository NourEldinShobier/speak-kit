import type { ReaderView } from "../../features/reader";
import type { ReaderSettings } from "../../features/settings";
import type { Ctx } from "./context";
import type { Docs } from "./docs";
import { defer } from "./lazy";
import { ACTIVE } from "./player-state";

/** Opening, closing and driving the reader view for one document of the page. */
export class ReaderSession {
  private readonly c: Ctx;
  private readonly docs: Docs;

  constructor(c: Ctx, docs: Docs) {
    this.c = c;
    this.docs = docs;
  }

  /** Open the reader on the document being read, or on the whole page when nothing is playing. */
  open() {
    const c = this.c;
    if (c.reader) return;
    let id = c.state && ACTIVE.includes(c.state.status) ? c.state.docId : undefined;
    if (!id || !c.docs.has(id) || c.docs.get(id)!.doc.source === "selection") {
      const r = this.docs.build("page");
      if ("error" in r) {
        c.ensureUi().toast("Speak Kit can't read this page", "err");
        return;
      }
      c.lastDoc = r;
      id = r.docId;
    }
    const d = c.docs.get(id)!;
    const ui = c.ensureUi();
    ui.hideBubble();
    ui.showGutter(null);
    c.readerDoc = id;
    const docId = id;
    c.reader = defer<ReaderView>(
      ui.ready.then((u) =>
        u.openReader(d.ex, docId, {
          settings: () => c.settings.reader,
          save: (p) => this.save(p),
          onClose: () => c.closeReader(),
          onPlayFrom: (i) => this.playFrom(docId, i),
          host: c.host,
        }),
      ),
    );
    if (c.current?.docId === id) c.reader.highlightSentence(c.current.index);
    c.refresh();
  }

  close() {
    const c = this.c;
    if (!c.reader) return;
    c.reader.close();
    c.reader = null;
    c.readerDoc = null;
    c.refresh();
  }

  private save(p: Partial<ReaderSettings>) {
    const c = this.c;
    c.settings = { ...c.settings, reader: { ...c.settings.reader, ...p } };
    void c.saveSettings((s) => {
      s.reader = { ...s.reader, ...p };
    });
  }

  /** Read from sentence `i` of the reader's document: seek when it is the one playing, else start it there. */
  private playFrom(docId: string, i: number) {
    const c = this.c;
    const d = c.docs.get(docId);
    if (!d) return;
    if (c.state && ACTIVE.includes(c.state.status) && c.state.docId === docId) c.cmd({ cmd: "seek-sentence", index: i });
    else {
      c.lastDoc = { ...d.doc, startIndex: i };
      c.cmd({ cmd: "play", doc: c.lastDoc });
    }
  }
}
