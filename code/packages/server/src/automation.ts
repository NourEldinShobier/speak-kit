import type { AutomationErrorCode, AutomationExport, AutomationExportRequest, AutomationQueue, AutomationSpeakRequest, AutomationSpeakResult, AutomationStatus } from "@speakkit/protocol";

/** A request the host app refuses; the route turns the code into the HTTP status and body of the automation errors. */
export class AutomationFault extends Error {
  readonly code: AutomationErrorCode;
  constructor(code: AutomationErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * What the desktop app lends the server so scripts and AI apps can use the reader. The server validates size and shape first;
 * the host decides what a reading, a queue and an export are. Every method may throw an AutomationFault.
 */
export interface AutomationHost {
  status(): AutomationStatus;
  queue(): AutomationQueue;
  speak(req: AutomationSpeakRequest): Promise<AutomationSpeakResult>;
  /** Stops the reading; with `clear` the waiting list is emptied too, otherwise the next waiting item starts. */
  stop(clear: boolean): AutomationStatus;
  startExport(req: AutomationExportRequest): Promise<AutomationExport>;
  exportStatus(id: string): AutomationExport | undefined;
  /** Calls `listener` with the new status after every change; returns the unsubscribe function. */
  subscribe(listener: (s: AutomationStatus) => void): () => void;
}
