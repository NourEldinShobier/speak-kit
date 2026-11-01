import { EngineUnavailableError, WavError, analyzeClip, parseWav } from "@speakkit/engine";
import { MAX_CLIP_BODY, parseClone } from "../config";
import type { EngineRegistry } from "../engines";
import { HttpError, json, noContent, readBody, validated } from "../http";
import type { Route } from "../router";

export const voiceIds = (engines: EngineRegistry) => new Set(engines.active.voices().map((v) => v.id));

const UNUSABLE = new Set(["missing", "unavailable", "installing"]);

function cloneVoice(engines: EngineRegistry, body: ReturnType<typeof parseClone>) {
  const cloner = engines.cloner();
  const st = cloner?.status();
  if (!cloner?.clones || !st || UNUSABLE.has(st.state)) throw new EngineUnavailableError("Install Chatterbox to clone voices", cloner?.info?.().reason ?? "not-installed");
  const bytes = Buffer.from(body.audio, "base64");
  let report;
  try {
    report = analyzeClip(parseWav(bytes));
  } catch (e) {
    if (e instanceof WavError) throw new HttpError(422, "clip-rejected", e.message);
    throw e;
  }
  if (!report.ok) throw new HttpError(422, "clip-rejected", report.checks.find((c) => !c.ok)!.message).with({ extra: { checks: report.checks } });
  return cloner.clones.add({ name: body.name, wav: bytes, durationMs: report.durationMs, checks: report.checks, ...(body.gender && { gender: body.gender }) });
}

/** Voice cloning (Chatterbox only). */
export const voiceRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/voices/clone",
    handle: async ({ req, res }, { engines }) => {
      const raw = await readBody(req, MAX_CLIP_BODY);
      json(
        res,
        201,
        cloneVoice(
          engines,
          validated(() => parseClone(raw)),
        ),
      );
    },
  },
  { method: "GET", path: "/v1/voices/cloned", handle: ({ res }, { engines }) => json(res, 200, { voices: engines.cloner()?.clones?.list() ?? [] }) },
  {
    method: "DELETE",
    path: /^\/v1\/voices\/(cb_[0-9a-f]{8})$/,
    handle: ({ res, params }, { engines }) => {
      if (!engines.cloner()?.clones?.remove(params[0]!)) throw new HttpError(404, "not-found", "no such cloned voice");
      noContent(res);
    },
  },
];
