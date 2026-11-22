import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown; document?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
  (globalThis as { document?: unknown }).document = { hidden: false };
});

import { Home } from "./HomePage";
import { loadLocale, LOCALES } from "../shared/i18n";
import { LocaleProvider } from "./i18n";
import { Settings } from "./settings";
import { QuickTopics, SettingsResults } from "./features/settings";
import type { ReactNode } from "react";

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));

const es = (node: ReactNode) => renderToStaticMarkup(<LocaleProvider choice="es">{node}</LocaleProvider>);
const settings = (sub: Parameters<typeof Settings>[0]["sub"], config = {}, over = {}) =>
  es(<Settings s={appState({ config: parseConfig({ setupDone: true, language: "es", ...config }), ...over })} sub={sub} />);

describe("language choice", () => {
  it("shows the Home page in French and Arabic", () => {
    const home = (choice: string) =>
      renderToStaticMarkup(<LocaleProvider choice={choice}>{<Home s={appState({ port: 48999, health: { engine: { state: "ready" } } as never })} go={() => {}} />}</LocaleProvider>);
    expect(home("fr")).toContain("Moteur vocal");
    expect(home("ar")).toContain("محرك الصوت");
  });
});

describe("pages in Spanish", () => {
  it("Home", () => {
    const html = es(<Home s={appState({ port: 48999, health: { engine: { state: "ready" } } as never })} go={() => {}} />);
    for (const text of ["Inicio", "Speak Kit ejecuta un servidor de voz privado", "Servidor", "En marcha", "Escuchando en", "Motor de voz", "Instala la extensión", "Token de vinculación"])
      expect(html).toContain(text);
    for (const text of ["Listening on", "Install the extension", "Pairing token", "Manage"]) expect(html).not.toContain(text);
  });

  it("Home names a busy port and a failed server", () => {
    const html = es(<Home s={appState({ portFallback: true, port: 48000, serverError: { code: "unexpected", args: { detail: "x" } } })} go={() => {}} />);
    expect(html).toContain("El puerto 47615 está en uso");
    expect(html).toContain("Speak Kit usa el 48000 en su lugar");
    expect(html).toContain("No se pudo iniciar el servidor");
  });

  it("Voice and playback", () => {
    const html = settings("voice");
    for (const text of ["Voz y reproducción", "Vista previa", "Velocidad de la vista previa"]) expect(html).toContain(text);
    expect(html).not.toContain("Used for previews");
  });

  it("Shortcuts, with the names of the actions", () => {
    const html = settings("shortcuts");
    for (const text of ["Atajos", "Leer la selección", "Reproducir o pausar", "Cambiar el atajo de Grabar una conversación", "Restablecer todos", "Vuelven a Ctrl+Alt+S, Space y R"])
      expect(html).toContain(text);
    expect(html).not.toContain("Read selection");
  });

  it("Shortcuts, with a clash", () => {
    const html = settings("shortcuts", {}, { shortcuts: { bindings: parseConfig({}).shortcuts, conflicts: { "record-toggle": { reason: "taken", accelerator: "Ctrl+Alt+X", suggestion: null } } } });
    expect(html).toContain("Otra aplicación usa Ctrl+Alt+X.");
  });

  it("Privacy", () => {
    const html = settings("privacy");
    for (const text of ["Privacidad", "Telemetría", "Desactivada, siempre", "Acceso al micrófono", "Comprobando...", "Abrir la configuración de Windows", "Dirección"]) expect(html).toContain(text);
    expect(html).not.toContain("Microphone access");
  });

  it("General", () => {
    const html = settings("general");
    for (const text of ["Abrir al iniciar sesión", "Idioma", "Importar ajustes"]) expect(html).toContain(text);
    expect(html).not.toContain("Launch at login");
  });

  it("the settings search", () => {
    const none = es(<SettingsResults q="zzz" groups={[]} onOpen={() => {}} onClear={() => {}} />);
    expect(none).toContain("Ningún ajuste coincide con “zzz”.");
    expect(none).toContain("Borrar la búsqueda");
    expect(es(<QuickTopics onPick={() => {}} />)).toContain("Temas rápidos");
  });
});
