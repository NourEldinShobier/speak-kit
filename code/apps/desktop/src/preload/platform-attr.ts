/** Sets `data-platform` on the document root as soon as the root exists (a preload runs before the page parses), so the first paint already has the platform's radii. */
export function setPlatformEarly(doc: Document, platform: string): void {
  const set = () => doc.documentElement?.setAttribute("data-platform", platform);
  set();
  if (doc.documentElement) return;
  const watch = new MutationObserver(() => {
    set();
    if (doc.documentElement) watch.disconnect();
  });
  watch.observe(doc, { childList: true });
}
