import { parseHTML } from "linkedom";
import { act } from "react";
import { describe, expect, test, vi } from "vite-plus/test";

function installDom() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  return document;
}

describe("ErrorBoundary", () => {
  test("renders children, then a Reload fallback after a render error, reporting the error once", async () => {
    const document = installDom();
    const { createRoot } = await import("react-dom/client");
    const { ErrorBoundary } = await import("../src/index");
    const onError = vi.fn();
    const onReload = vi.fn();
    let broken = false;
    const Child = () => {
      if (broken) throw new Error("boom");
      return <p>fine</p>;
    };
    const root = createRoot(document.getElementById("root")!);
    const ui = (
      <ErrorBoundary onError={onError} onReload={onReload}>
        <Child />
      </ErrorBoundary>
    );
    await act(async () => root.render(ui));
    expect(document.body.textContent).toContain("fine");
    broken = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () =>
      root.render(
        <ErrorBoundary onError={onError} onReload={onReload}>
          <Child />
        </ErrorBoundary>,
      ),
    );
    quiet.mockRestore();
    expect(document.body.textContent).toContain("Something went wrong");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toBe("boom");
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "Reload")!;
    await act(async () => button.click());
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
