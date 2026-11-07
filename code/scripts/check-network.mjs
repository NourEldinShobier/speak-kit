// Network calls and external hosts in runtime code must be listed in .ratchet/network-allowlist.json.
// A new file with fetch(...), http(s).request, net.connect, WebSocket, undici or electron-updater, or a new external host literal, fails.
import { readFileSync } from "node:fs";
import path from "node:path";
import { isRuntime, parseArgs, readJson, rel, report, walk } from "./check-lib.mjs";

const call =
  /\bfetch\s*\(|\bundiciFetch\s*\(|\bhttps?\.(?:request|get)\s*\(|\bnet\.(?:connect|fetch)\s*\(|\bnew WebSocket\s*\(|\bnew EventSource\s*\(|from ["'](?:undici|electron-updater|kokoro-js)["']|import\(["'](?:electron-updater|kokoro-js)["']\)/;
const hostRe = /https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi;
const ignoredHosts = /^(?:www\.w3\.org|example\.com|(?:www\.)?news\.example\.com)$/i;

const { root } = parseArgs(process.argv.slice(2));
const allow = readJson(path.join(root, ".ratchet", "network-allowlist.json"));
const files = new Set();
const hosts = new Set();
for (const file of walk(root)) {
  const r = rel(root, file);
  if (!isRuntime(r)) continue;
  const text = readFileSync(file, "utf8");
  if (call.test(text)) files.add(r);
  for (const m of text.matchAll(hostRe)) if (!ignoredHosts.test(m[1])) hosts.add(m[1].toLowerCase());
}

const problems = [];
const diff = (kind, found, listed) => {
  for (const x of found) if (!(x in listed)) problems.push(`${kind} not in the allow-list: ${x}`);
  for (const x of Object.keys(listed)) if (!found.has(x)) problems.push(`${kind} in the allow-list but no longer present: ${x}`);
};
diff("network call in", files, allow.files);
diff("external host", hosts, allow.hosts);
report("check-network", problems);
