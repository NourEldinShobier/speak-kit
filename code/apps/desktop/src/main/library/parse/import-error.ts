import { DesktopFault, type DesktopError } from "../../../shared/errors";
import type { ImportFailure } from "../../../shared/library/contract";

/** A document or page that cannot be added: the reason (what the UI offers next) and the error (what it says). */
export class ImportError extends DesktopFault {
  readonly reason: ImportFailure;
  constructor(reason: ImportFailure, error: DesktopError) {
    super(error);
    this.reason = reason;
  }
}
