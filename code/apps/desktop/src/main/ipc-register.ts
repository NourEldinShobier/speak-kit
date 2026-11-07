import type { IpcMain, IpcMainInvokeEvent } from "electron";
import * as v from "valibot";

interface ValidatedIpc<M extends string> {
  methods: readonly M[];
  channel(m: M): string;
  /** Valibot schema of each method's argument list. */
  args: Record<M, v.GenericSchema<unknown[]>>;
  handler(m: M): (...args: unknown[]) => unknown;
  /** true when the event comes from a window the app created */
  trusted(e: IpcMainInvokeEvent): boolean;
}

/** Registers one ipcMain.handle per method; each call is checked for sender and arguments before the handler runs. */
export function registerValidatedIpc<M extends string>(ipcMain: IpcMain, o: ValidatedIpc<M>): void {
  for (const m of o.methods)
    ipcMain.handle(o.channel(m), (e, ...args) => {
      if (!o.trusted(e)) throw new Error("Untrusted sender");
      const parsed = v.safeParse(o.args[m], args);
      if (!parsed.success) throw new Error(`Invalid arguments for ${m}`);
      return o.handler(m)(...parsed.output);
    });
}
