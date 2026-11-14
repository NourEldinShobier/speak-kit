import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import type { Health } from "@speakkit/protocol";
import { errorView } from "../../main/dictation/hud-view";
import { noticeFor } from "../../main/notify-rules";
import { ERROR_TEXT, errorText, updateErrorText } from "../../renderer/error-text";
import { engineView } from "../engine-view";
import { IDLE_READER } from "../reader";
import { activityRow } from "../settings/diagnostics";
import { deviceLines, modelText } from "../settings/resources";
import { DEFAULT_SHORTCUTS } from "../shortcuts";
import { trayMenuModel, trayTooltipFor, type TrayContext } from "../tray";
import { at, loadLocale, LOCALES, setActiveLocale, applyLanguage } from "./index";

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));
afterEach(() => setActiveLocale("en"));

const health = (state: "ready" | "unloaded"): Health => ({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state } });
const ctx = (over: Partial<TrayContext> = {}): TrayContext => ({
  health: health("ready"),
  serverError: null,
  reader: IDLE_READER,
  update: { kind: "idle", checkedAtMs: null },
  exportsRunning: 0,
  doNotDisturb: false,
  shortcuts: DEFAULT_SHORTCUTS,
  ...over,
});
const labels = (c: TrayContext) => trayMenuModel(c).flatMap((i) => (i.type === "item" ? [i.label] : []));

describe("text the main process builds", () => {
  it("is English until a language is chosen", () => {
    expect(labels(ctx())).toEqual(["Open Speak Kit", "Do not disturb", "Settings", "Check for updates", "Quit Speak Kit"]);
  });

  it("follows the chosen language in the tray menu and its tooltip", async () => {
    await applyLanguage("de", []);
    expect(labels(ctx())).toEqual(["Speak Kit öffnen", "Nicht stören", "Einstellungen", "Nach Updates suchen", "Speak Kit beenden"]);
    expect(trayTooltipFor(ctx({ exportsRunning: 2 }))).toBe("Speak Kit - Exportiert 2 Dateien");
    await applyLanguage("fr", []);
    expect(trayTooltipFor(ctx({ exportsRunning: 1 }))).toBe("Speak Kit - Export de 1 fichier");
    expect(trayTooltipFor(ctx({ health: health("unloaded") }))).toBe("Speak Kit - Déchargé (se réveille à la lecture)");
  });

  it("resolves the system language when the choice is system", async () => {
    await applyLanguage("system", ["it-IT", "es-MX"]);
    expect(at("tray.quit")).toBe("Salir de Speak Kit");
  });

  it("translates toasts, the dictation pill and engine labels", async () => {
    await applyLanguage("es", []);
    expect(noticeFor("ready", "error", "Se detuvo.")).toEqual({ event: "engine-error", taskKey: "kokoro", title: "Problema con el motor de voz", body: "Se detuvo. Haz clic para abrir Speak Kit." });
    expect(errorView("mic-missing", false)).toMatchObject({ text: "No se encontró ningún micrófono", action: { label: "Ajustes de sonido", id: "sound-settings" } });
    expect(engineView(health("ready"), null).label).toBe("Listo");
    expect(at("hud.recovered", { n: 3 })).toBe("Se recuperaron 3 grabaciones de la sesión anterior");
  });

  it("writes Arabic plurals with the Arabic forms", async () => {
    await applyLanguage("ar", []);
    expect(at("hud.recovered", { n: 2 })).toBe("استُعيد تسجيلان من الجلسة الأخيرة");
    expect(at("tray.tipExporting", { n: 1 })).toBe("Speak Kit - جارٍ تصدير ملف واحد");
  });

  it("gives every error code a sentence in every language", async () => {
    const samples = { name: "a", detail: "d", host: "h", mb: 1, status: 500, from: 1, to: 2, seconds: 3, type: "t", ext: "e", supported: "s", count: 4, exitCode: 5, platform: "win32" };
    const codes = (Object.keys(ERROR_TEXT) as (keyof typeof ERROR_TEXT)[]).filter((c) => !["unexpected", "update-failed", "server-error", "render-failed"].includes(c)); // these four show the detail itself
    const english = codes.map((code) => errorText({ code, args: samples } as never));
    for (const l of LOCALES.filter((x) => x !== "en")) {
      await applyLanguage(l, []);
      expect(codes.filter((code, i) => errorText({ code, args: samples } as never) === english[i])).toEqual([]);
    }
  });

  it("translates an error sentence and the update error titles", async () => {
    await applyLanguage("fr", []);
    expect(errorText({ code: "no-selection" })).toBe("Aucun texte n’est sélectionné. Sélectionnez du texte, puis réessayez.");
    expect(updateErrorText({ code: "update-offline" }, "check").title).toBe("Impossible de rechercher des mises à jour");
  });

  it("translates the Settings helpers that build text", async () => {
    await applyLanguage("de", []);
    expect(activityRow({ id: 1, atMs: 0, kind: "error", title: "t", body: "b" })).toEqual({ title: "t", detail: "Problem: b" });
    expect(modelText({ kind: "voice", name: "x", state: "loaded", mb: 120.4 })).toBe("Geladen, 120 MB");
    expect(deviceLines({ platform: "win32", arch: "x64", cores: 8, ramGb: 16, gpu: null, speechRunsOn: "CPU" }).map((l) => l.value)).toEqual([
      "Windows (x64)",
      "8 Kerne",
      "16 GB",
      "Keine gefunden",
      "CPU",
    ]);
  });
});
