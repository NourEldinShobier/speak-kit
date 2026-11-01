import { useState } from "react";
import type { AppState } from "../../../shared/ipc";
import { Reader } from "../reader";
import { LibraryPage } from "./LibraryPage";

/** The library list, or the reader for one reading. Leaving the reader stops playback (the reader owns the player). */
export function LibraryRoute({ s }: { s: AppState }) {
  const [open, setOpen] = useState<{ id: string; autoplay: boolean } | null>(null);
  return open ? <Reader key={open.id} s={s} id={open.id} autoplay={open.autoplay} onBack={() => setOpen(null)} /> : <LibraryPage s={s} onOpen={(id, autoplay) => setOpen({ id, autoplay })} />;
}
