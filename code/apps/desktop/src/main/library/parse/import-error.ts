import type { ImportFailure } from "../../../shared/library/contract";

export class ImportError extends Error {
  readonly reason: ImportFailure;
  constructor(reason: ImportFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}
