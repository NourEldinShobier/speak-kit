import type { ImportFailure } from "../../../shared/library/contract";

export class ImportError extends Error {
  constructor(
    readonly reason: ImportFailure,
    message: string,
  ) {
    super(message);
  }
}
