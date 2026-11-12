import { orNull } from "./or-null";

export interface SseEvent {
  event: string;
  data: string;
}

/** Events of a text/event-stream body. Comment lines (heartbeats) are skipped; an event split across chunks is joined; a trailing partial event is dropped. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const e = eventOf(block);
        if (e) yield e;
      }
    }
  } finally {
    await orNull(reader.cancel());
  }
}

function eventOf(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":") || !line) continue;
    const colon = line.indexOf(":");
    const [field, rest] = colon < 0 ? [line, ""] : [line.slice(0, colon), line.slice(colon + 1).replace(/^ /, "")];
    if (field === "event") event = rest;
    else if (field === "data") data.push(rest);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
