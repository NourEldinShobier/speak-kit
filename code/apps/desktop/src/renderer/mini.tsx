import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@speakkit/ui";
import "@speakkit/ui/styles.css";
import "./float.css";
import { MiniPlayer } from "./MiniPlayer";
import { ChunkPlayer, type AudioLike } from "./player";
import { api, useAppState } from "./ui";

/** The mini player owns the audio output: main sends sentences here and follows the start and end events. */
const player = new ChunkPlayer((rate) => new AudioContext({ sampleRate: rate }) as unknown as AudioLike, {
  started: (epoch, index) => void api.readerStarted(epoch, index),
  done: (epoch, index) => void api.readerDone(epoch, index),
});
api.onUi((e) => {
  if (e.type === "chunk") player.chunk(e.epoch, e.index, e.audio);
  else if (e.type === "player") player[e.op]();
});

function Mini() {
  const s = useAppState();
  const [onTop, setOnTop] = useState(true);
  useEffect(() => void api.reader({ type: "keep-on-top", on: onTop }), [onTop]);
  return s ? <MiniPlayer s={s} onTop={onTop} setOnTop={setOnTop} /> : null;
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Mini />
  </ErrorBoundary>,
);
