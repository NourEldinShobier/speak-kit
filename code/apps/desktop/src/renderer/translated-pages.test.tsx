import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown; document?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
  (globalThis as { document?: unknown }).document = { hidden: false };
});

import { loadLocale, LOCALES } from "../shared/i18n";
import { LocaleProvider } from "./i18n";
import { Settings } from "./settings";
import { BrowserPage } from "./features/settings/BrowserPage";
import { QuickTopics, SettingsResults } from "./features/settings";
import type { ReactNode } from "react";

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));

const es = (node: ReactNode) => renderToStaticMarkup(<LocaleProvider choice="es">{node}</LocaleProvider>);
const settings = (sub: Parameters<typeof Settings>[0]["sub"], config = {}, over = {}) =>
  es(<Settings s={appState({ config: parseConfig({ setupDone: true, language: "es", ...config }), ...over })} sub={sub} />);

describe("language choice", () => {
  it("shows the Browser integration page in French and Arabic", () => {
    const browser = (choice: string) =>
      renderToStaticMarkup(
        <LocaleProvider choice={choice}>
          <BrowserPage s={appState()} />
        </LocaleProvider>,
      );
    expect(browser("fr")).toContain("Jeton d’association");
    expect(browser("ar")).toContain("رمز الاقتران");
  });
});

describe("pages in Spanish", () => {
  it("Browser integration, with its single pairing step", () => {
    const html = es(<BrowserPage s={appState()} />);
    for (const text of ["Token de vinculación", "Cópialo aquí y pégalo en las opciones de la extensión, en General."]) expect(html).toContain(text);
    for (const text of ["Pairing token", "Server port", "Regenerate"]) expect(html).not.toContain(text);
  });

  it("Shortcuts, with the names of the actions", () => {
    const html = settings("shortcuts");
    for (const text of ["Atajos", "Leer la selección", "Reproducir o pausar", "Cambiar el atajo de Reproducir o pausar", "Restablecer todos", "Vuelven a Ctrl+Alt+S y Space"])
      expect(html).toContain(text);
    expect(html).not.toContain("Read selection");
  });

  it("Shortcuts, with a clash", () => {
    const html = settings("shortcuts", {}, { shortcuts: { bindings: parseConfig({}).shortcuts, conflicts: { "play-pause": { reason: "taken", accelerator: "Ctrl+Alt+X", suggestion: null } } } });
    expect(html).toContain("Otra aplicación usa Ctrl+Alt+X.");
  });

  it("Privacy", () => {
    const html = settings("privacy");
    for (const text of ["Privacidad", "Acceso al micrófono", "Comprobando...", "Abrir la configuración de Windows", "Dirección"]) expect(html).toContain(text);
    expect(html).not.toContain("Microphone access");
  });

  it("General", () => {
    const html = settings("general");
    for (const text of ["Abrir al iniciar sesión", "Idioma"]) expect(html).toContain(text);
    expect(html).not.toContain("Launch at login");
  });

  it("the settings search", () => {
    const none = es(<SettingsResults q="zzz" groups={[]} onOpen={() => {}} onClear={() => {}} />);
    expect(none).toContain("Ningún ajuste coincide con “zzz”.");
    expect(none).toContain("Borrar la búsqueda");
    expect(es(<QuickTopics onPick={() => {}} />)).toContain("Temas rápidos");
  });
});
