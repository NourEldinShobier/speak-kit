/** Where the page address the browser extension reports goes: the host app keeps it for a short while. "" means no page is in front. */
export interface PageContextHost {
  report(host: string): void;
}
