/** Runs one action against the models bridge; the page then follows the view the main process pushes. */
export type Run = (f: () => Promise<unknown>) => void;
