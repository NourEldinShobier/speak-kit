import { parseExport } from "../config";
import { HttpError, json, noContent, readBody, validated } from "../http";
import type { Route } from "../router";
import { voiceIds } from "./voice-ids";

const ID = "([0-9a-f]{16})";

/** Export jobs: render sentences to one WAV in the background. */
export const exportRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/export",
    handle: async ({ req, res, signal }, { engines, exporter }) => {
      const raw = await readBody(req);
      signal.throwIfAborted();
      const input = validated(() => parseExport(voiceIds(engines), raw));
      json(res, 202, await exporter.create(engines.active, input, signal));
    },
  },
  {
    method: "GET",
    path: new RegExp(`^/v1/export/${ID}$`),
    handle: ({ res, params }, { exporter }) => {
      const job = exporter.get(params[0]!);
      if (!job) throw new HttpError(404, "not-found", "no such export");
      json(res, 200, exporter.view(job));
    },
  },
  {
    method: "DELETE",
    path: new RegExp(`^/v1/export/${ID}$`),
    handle: async ({ res, params }, { exporter }) => {
      await exporter.cancel(params[0]!);
      noContent(res);
    },
  },
  {
    method: "GET",
    path: new RegExp(`^/v1/export/${ID}/audio$`),
    handle: async ({ res, params }, { exporter }) => {
      const job = exporter.get(params[0]!);
      if (!job) throw new HttpError(404, "not-found", "no such export");
      if (job.state !== "done") throw new HttpError(409, "busy", `export is ${job.state}`);
      const { stream, length } = await exporter.audio(job);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": length, "Cache-Control": "no-store" });
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    },
  },
];
