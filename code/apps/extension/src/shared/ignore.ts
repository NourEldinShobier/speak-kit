/** For a promise whose failure changes nothing: the document or page it talked to is already gone. Resolves to undefined. */
export const ignore = (): undefined => undefined;

/** Resolves after ms milliseconds. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
