import type { ReaderState } from "../shared/reader";
import { errorText } from "./error-text";
import { at } from "../shared/i18n";
import "../shared/i18n/packs/main";

/** One line under the title in the mini player. */
export const statusLine = (r: ReaderState): string => {
  switch (r.status) {
    case "preparing":
      return "Preparing the voice...";
    case "playing":
      return `Sentence ${r.index + 1} of ${r.total}`;
    case "paused":
      return `Paused · sentence ${r.index + 1} of ${r.total}`;
    case "finished":
      return "Finished";
    case "error":
      return r.error ? errorText(r.error) : at("err.generic");
    default:
      return "";
  }
};
