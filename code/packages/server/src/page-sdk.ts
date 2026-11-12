/**
 * The script a development page includes to report clicks, console errors and failed requests to the local server:
 * `<script src="http://127.0.0.1:PORT/v1/capture/page-context/sdk.js" data-token="TOKEN"></script>`.
 * It reports names only (a button's text, a tag, a path of tags), never what is typed, and it never reports its own requests.
 */
export function pageSdk(w: any, d: any): void {
  const script = d.currentScript;
  const token = script?.getAttribute("data-token");
  if (!script?.src || !token || w.__speakkitPage) return;
  w.__speakkitPage = true;
  const url = `${new URL(script.src).origin}/v1/capture/page-context`;
  const send = w.fetch.bind(w);
  const queue: unknown[] = [];
  let timer: unknown;
  const flush = () => {
    timer = undefined;
    const events = queue.splice(0, 50);
    if (!events.length) return;
    send(url, {
      method: "POST",
      keepalive: true,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ page: { url: String(w.location.href).slice(0, 2048), title: String(d.title).slice(0, 80) }, events }),
    }).catch(() => undefined);
    if (queue.length) timer = w.setTimeout(flush, 1000);
  };
  const add = (e: unknown) => {
    if (queue.length < 200) queue.push(e);
    timer ??= w.setTimeout(flush, 1000);
  };
  const tagOf = (el: any) => {
    const t = String(el.tagName).toLowerCase().slice(0, 32);
    return /^[a-z][a-z0-9-]*$/.test(t) ? t : "element";
  };
  const part = (el: any) => tagOf(el) + (el.id ? `#${String(el.id).slice(0, 30)}` : "");
  const pathOf = (el: any) => {
    const parts: string[] = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) parts.unshift(part(n));
    return parts.join(" > ").slice(0, 160);
  };
  const clicked = (ev: any) => {
    const el = ev.target?.closest?.("button, a, [role], input, select, textarea, summary, label") ?? ev.target;
    if (!el || el.nodeType !== 1) return;
    const tag = tagOf(el);
    const typed = tag === "input" || tag === "textarea" || tag === "select";
    const label = typed ? "" : String(el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const role = el.getAttribute("role");
    add({ type: "click", at: Date.now(), element: { tag, ...(role && { role: String(role).slice(0, 32) }), ...(label && { label }), path: pathOf(el) } });
  };
  const fail = (message: string) => add({ type: "console-error", at: Date.now(), message: message.slice(0, 400) });
  d.addEventListener("click", clicked, true);
  w.addEventListener("error", (e: any) => fail(String(e.message)));
  w.addEventListener("unhandledrejection", (e: any) => fail(String(e.reason)));
  const consoleError = w.console.error.bind(w.console);
  w.console.error = (...args: unknown[]) => {
    fail(args.map(String).join(" "));
    consoleError(...args);
  };
  w.fetch = async (input: any, init?: any) => {
    const target = String(input?.url ?? input).slice(0, 2048);
    const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
    const report = (status: number) => /^[A-Z]{3,7}$/.test(method) && !target.startsWith(url) && add({ type: "failed-request", at: Date.now(), method, url: target, status });
    try {
      const res = await send(input, init);
      if (res.status >= 400) report(res.status);
      return res;
    } catch (e) {
      report(0);
      throw e;
    }
  };
}

export const PAGE_SDK_SOURCE = `(${pageSdk.toString()})(window, document);\n`;
