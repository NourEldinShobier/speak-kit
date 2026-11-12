import path from "node:path";
import { DEFAULT_PORT, LOOPBACK_HOST } from "@speakkit/protocol";
import { CliError } from "./errors";

type Env = Readonly<Record<string, string | undefined>>;

/** Where the app keeps its settings, token and server.json: the same folder the desktop app chooses for userData. */
export function dataDirFor(o: { platform: NodeJS.Platform; env: Env; home: string }): string {
  if (o.env["SPEAKKIT_USER_DATA"]) return o.env["SPEAKKIT_USER_DATA"];
  if (o.platform === "darwin") return path.posix.join(o.home, "Library", "Application Support", "@speakkit", "desktop");
  if (o.platform === "win32") return path.win32.join(o.env["APPDATA"] ?? path.win32.join(o.home, "AppData", "Roaming"), "@speakkit", "desktop");
  return path.posix.join(o.env["XDG_CONFIG_HOME"] ?? path.posix.join(o.home, ".config"), "@speakkit", "desktop");
}

export interface Connection {
  base: string;
  token: string;
}

export interface DiscoverIo {
  env: Env;
  platform: NodeJS.Platform;
  home: string;
  readText(file: string): Promise<string | null>;
}

const portOf = (s: unknown): number | null => {
  const n = typeof s === "string" && /^\d+$/.test(s) ? Number(s) : s;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
};
const jsonPort = async (io: DiscoverIo, file: string, key: string): Promise<number | null> => {
  const text = await io.readText(file);
  if (!text) return null;
  try {
    return portOf((JSON.parse(text) as Record<string, unknown>)[key]);
  } catch {
    return null;
  }
};

/**
 * The address and token of the running app. Token: --token, SPEAKKIT_TOKEN, then the token file in the data folder.
 * Port: --port, SPEAKKIT_PORT, then server.json (what the app really listens on, also after a port fallback), then the saved port, then the default.
 */
export async function discover(io: DiscoverIo, flags: { port?: string | undefined; token?: string | undefined }): Promise<Connection> {
  const dir = dataDirFor(io);
  const token = flags.token || io.env["SPEAKKIT_TOKEN"] || (await io.readText(path.join(dir, "token")))?.trim();
  if (!token) throw new CliError("not_running", `Speak Kit has not been started on this computer: there is no token in ${dir}.`);
  const given = flags.port ?? io.env["SPEAKKIT_PORT"];
  if (given !== undefined && given !== "" && portOf(given) === null) throw new CliError("invalid_input", `"${given}" is not a port number (1 to 65535).`);
  const port = portOf(given) ?? (await jsonPort(io, path.join(dir, "server.json"), "port")) ?? (await jsonPort(io, path.join(dir, "config.json"), "preferredPort")) ?? DEFAULT_PORT;
  return { base: `http://${LOOPBACK_HOST}:${port}`, token };
}
