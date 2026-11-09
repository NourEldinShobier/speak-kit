// Live check of the voice chat key code against the real OpenAI API. Not a test: it costs a little and needs a real key, so CI never runs it.
//   node apps/desktop/scripts/live-voice-key.mjs [path to a file holding the key]
// The key file defaults to tmp/.secrets/openai-test-key in the nearest parent folder that has one. The key is read into SPEAKKIT_LIVE_KEY and
// goes only to api.openai.com through the same functions the app uses; it and the client secret are never printed.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mintClientSecret, OPENAI_BASE_URL, testKey } from "../src/main/voice-chat/openai.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function findKeyFile() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  for (let dir = here; ; dir = path.dirname(dir)) {
    const f = path.join(dir, "tmp", ".secrets", "openai-test-key");
    if (existsSync(f)) return f;
    if (path.dirname(dir) === dir) throw new Error("no tmp/.secrets/openai-test-key found above " + here);
  }
}

process.env.SPEAKKIT_LIVE_KEY = readFileSync(findKeyFile(), "utf8").trim();
const key = process.env.SPEAKKIT_LIVE_KEY;
const net = { baseUrl: OPENAI_BASE_URL, fetch };
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const minted = await mintClientSecret(key, { ...net, model: "gpt-realtime-2.1", voice: "marin" });
if (minted.ok) {
  const { clientSecret, expiresAt } = minted.value;
  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  check("client secret returned", typeof clientSecret === "string" && clientSecret.length > 10 && clientSecret !== key, `ek_ prefix: ${clientSecret.startsWith("ek_")}, length ${clientSecret.length}`);
  check("expiry is in the future", secondsLeft > 0, `${secondsLeft} s from now`);
} else {
  check("client secret returned", false, `code ${minted.code}`);
}

const tested = await testKey(key, net);
check("test key accepted", tested.ok, tested.ok ? "" : `code ${tested.code}`);

process.exit(checks.every(Boolean) ? 0 : 1);
