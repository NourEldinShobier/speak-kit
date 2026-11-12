import { dialog, shell, type BrowserWindow } from "electron";
import { mkdir } from "node:fs/promises";
import type { Ctx } from "../context";
import type { Api } from "../../shared/ipc";
import { DesktopFault } from "../../shared/errors";
import { exportRunning } from "../../shared/export";
import type { ToastCenter } from "../toasts";
import { ExportJobs, targetFor } from "./jobs";
import { mp3InWorker } from "./mp3-runner";

type ExportHandlers = Pick<Api, "exportCheck" | "exportStart" | "exportCancel" | "exportReveal" | "pickFolder">;

/** What the automation host needs of the exports: a job from an explicit path, which replaces a file that is already there, and a look at a job. */
function automationJobs(ctx: Ctx, jobs: ExportJobs) {
  return {
    start: async (o: { text: string; dir: string; name: string; format: "wav" | "mp3" }) => {
      await mkdir(o.dir, { recursive: true });
      return jobs.start({ ...o, voice: ctx.config.voice, speed: ctx.config.speed, mp3Kbps: ctx.config.exportPrefs.mp3Kbps, conflict: "replace" });
    },
    view: (id: string) => jobs.views.find((v) => v.id === id),
  };
}

/** Exports for the app: the job runner wired to the server, the state stream, toasts and the folder picker. */
export function createExports(ctx: Ctx, toasts: ToastCenter, o: { parent: () => BrowserWindow | null; workerFile: URL; onChange: () => void }) {
  const jobs = new ExportJobs({
    server: ctx.server,
    mp3: mp3InWorker(o.workerFile),
    onChange: (views) => {
      ctx.state.exports = views.map((v) => ({ ...v }));
      o.onChange();
      ctx.publish();
    },
    onDone: (v) => {
      ctx.addActivity("export", "Export finished", `${v.name} is saved.`);
      toasts.notify({
        event: "export-done",
        taskKey: v.id,
        title: "Export finished",
        body: `${v.name} is saved. Click to show it in its folder.`,
        onClick: () => v.path && shell.showItemInFolder(v.path),
      });
    },
  });

  const handlers: ExportHandlers = {
    exportCheck: (dir, name, format) => targetFor(dir || ctx.state.exportDir, name, format),
    exportStart: async (o) => {
      const dir = o.dir || ctx.state.exportDir;
      await mkdir(dir, { recursive: true });
      ctx.config.exportPrefs = { format: o.format, mp3Kbps: o.mp3Kbps, folder: dir === ctx.state.exportDir ? "" : dir };
      ctx.saveConfig();
      return jobs.start({ ...o, dir });
    },
    exportCancel: (id) => jobs.cancel(id),
    exportReveal: async (path, open) => {
      // Only files this session exported: the renderer cannot make the main process open arbitrary paths.
      if (!ctx.state.exports.some((e) => e.path === path)) throw new DesktopFault({ code: "not-exported" });
      if (open) await shell.openPath(path);
      else shell.showItemInFolder(path);
    },
    pickFolder: async (current) => {
      const w = o.parent();
      const opts = { defaultPath: current || ctx.state.exportDir, properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
  };

  return {
    handlers,
    ...automationJobs(ctx, jobs),
    runningCount: () => ctx.state.exports.filter(exportRunning).length,
    dispose: () => jobs.cancelAll(),
  };
}
