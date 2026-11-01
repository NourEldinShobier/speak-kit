/**
 * The library: the list page with its import dialogs, and the bridge to the stored readings.
 * Does not know about the reader; the app composes the route (list or reader) and the reader imports the helpers from here.
 * Area: desktop renderer.
 */
export { LibraryPage } from "./LibraryPage";
export { library } from "./api";
export { clock, estimateMs, span } from "./model";
