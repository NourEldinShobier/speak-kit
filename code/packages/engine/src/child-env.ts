/**
 * Environment for child processes (model host, Chatterbox installer and sidecar).
 * Does: copies an allowlist of the parent environment, then the caller's extra variables.
 * Does not: pass secrets or unrelated variables (tokens, API keys) through to children.
 * Area: engine / process hygiene.
 */

const EXACT = new Set([
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "USERNAME",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "LANG",
  "LC_ALL",
  "ELECTRON_RUN_AS_NODE", // a forked model host inside Electron must stay a plain node process
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "NODE_EXTRA_CA_CERTS",
]);
const PREFIXES = ["CUDA_", "HF_", "PYTHON", "UV_", "PIP_", "SPEAKKIT_"];

/** Names compare case-insensitively (Windows environment names are), and the original spelling is kept. */
function allowed(name: string): boolean {
  const n = name.toUpperCase();
  return EXACT.has(n) || PREFIXES.some((p) => n.startsWith(p));
}

/**
 * The allowlisted part of `source` (default: this process's environment) plus `extra`.
 * @param extra variables the child needs regardless of the allowlist; they win over inherited ones.
 */
export function childEnv(extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined && allowed(k)) env[k] = v;
  return { ...env, ...extra };
}
