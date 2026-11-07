import type { EngineInfo, EngineList } from "@speakkit/protocol";

/** Whether the Voices page can start cloning, and when it cannot, what is needed. */
export type Availability = { kind: "unknown" } | { kind: "ready" } | { kind: "unavailable"; title: string; detail: string };

const NEEDS = "Cloning needs Chatterbox (2.4 GB)";

const gb = (mb: number) => Math.round(mb / 1024);

function reasonDetail(e: EngineInfo): string {
  const found = e.gpu ? ` Found ${e.gpu.name} with ${gb(e.gpu.vramMb)} GB of video memory.` : "";
  if (e.state === "unavailable")
    return e.reason === "python-missing" ? "Chatterbox needs Python 3.10 to 3.12 or uv, and neither was found." : (e.detail ?? "Chatterbox needs an NVIDIA graphics card with 4 GB of video memory.");
  if (e.reason === "disk-full") return e.detail ?? "There is not enough free disk space to install it.";
  return `Install it on the Engines page.${found}`;
}

/** Cloning works once Chatterbox is installed, whether or not it is the engine in use or loaded; the server refuses only when it is missing, unavailable or installing. */
export function cloningAvailability(list: EngineList | null): Availability {
  if (!list) return { kind: "unknown" };
  const e = list.engines.find((x) => x.cloning);
  if (!e) return { kind: "unknown" }; // a server started without Chatterbox (SPEAKKIT_CHATTERBOX=off): the button stays off and nothing is promised
  if (e.state === "installing") return { kind: "unavailable", title: "Chatterbox is installing", detail: "Cloning is available when the install finishes." };
  if (e.state === "missing" || e.state === "unavailable") return { kind: "unavailable", title: NEEDS, detail: reasonDetail(e) };
  return { kind: "ready" };
}
