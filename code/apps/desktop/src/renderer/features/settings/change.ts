import type { ConfigPatch } from "../../../shared/ipc";
import { api } from "../../ui";

/** Changes app settings through the settings registry, the same validator the command line uses; a refusal throws its message. */
export async function change(patch: ConfigPatch): Promise<void> {
  const r = await api.applySettings(patch);
  if (!r.ok) throw new Error(r.message);
}
