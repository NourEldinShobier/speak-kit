/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const LIBRARY_METHODS = [
  "list",
  "get",
  "search",
  "importText",
  "importClipboard",
  "importBytes",
  "pickFiles",
  "importUrl",
  "rename",
  "setVoice",
  "setFinished",
  "setProgress",
  "markOpened",
  "remove",
  "restore",
  "showInFolder",
  "source",
  "replaceBlocks",
] as const;
export type LibraryMethod = (typeof LIBRARY_METHODS)[number];
export const libraryChannel = (m: string) => `speakkit:library:${m}`;

/** Speak proxy: the renderer's origin is file://, which the server rejects, so requests to /v1 go through main (see speak-proxy.ts). */
export const PROXY_OPEN = "speakkit:proxy:open";
export const PROXY_CANCEL = "speakkit:proxy:cancel";
export const PROXY_CHUNK = "speakkit:proxy:chunk";
export const PROXY_PATHS = ["/v1/speak", "/v1/engine/hold", "/v1/health"] as const;
