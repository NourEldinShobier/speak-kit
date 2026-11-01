// Regenerates THIRD_PARTY_NOTICES.md from the production dependency tree of the pnpm workspace.
// Usage (after `pnpm install` in code/): node tools/third-party-notices.mjs [--check]
// Uses the built-in `pnpm licenses`; --check exits 1 when the committed file is out of date.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "THIRD_PARTY_NOTICES.md");
const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  cwd: join(root, "code"),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === "win32",
});
const byLicense = JSON.parse(raw);
if (byLicense.Unknown) throw new Error(`Unknown license for: ${byLicense.Unknown.map((p) => p.name).join(", ")}. Run pnpm install first.`);

const rows = (pkgs) =>
  pkgs
    .map((p) => ({ name: p.name, versions: [...p.versions].sort().join(", "), url: (p.homepage ?? "").replace(/#readme$/, "") }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `| ${p.name} | ${p.versions} | ${p.url ? `<${p.url}>` : ""} |`);

const sections = Object.entries(byLicense)
  .sort(([a, x], [b, y]) => y.length - a.length || a.localeCompare(b))
  .map(([license, pkgs]) => `### ${license} (${pkgs.length})\n\n| Package | Version | Homepage |\n|---|---|---|\n${rows(pkgs).join("\n")}\n`);
const total = Object.values(byLicense).reduce((n, p) => n + p.length, 0);

const text = `# Third-party notices

Speak Kit is released under the [MIT licence](LICENSE). It includes and downloads the third-party software, models, fonts and icons below, each under its own licence.

## Models and assets

| Item | Used for | Licence |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (ONNX build \`onnx-community/Kokoro-82M-v1.0-ONNX\`) | Default voices. Downloaded on first run, not bundled. | Apache-2.0 |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) (Resemble AI) | Optional voice cloning engine, run by a Python sidecar. Downloaded on demand, not bundled. | MIT |
| [Inter](https://rsms.me/inter/) | UI typeface named in the style sheets; used when installed on the system, not bundled. | SIL Open Font License 1.1 |
| [Tabler Icons](https://tabler.io/icons) | Interface icons (\`@tabler/icons-react\`). | MIT |
| [LAME](https://lame.sourceforge.io/) through \`wasm-media-encoders\` | MP3 export, compiled to WebAssembly and loaded as a separate module. | LGPL-2.1 (the wrapper is MIT) |
| Lumen design tokens and components | Visual language of the app and extension. | The author's own work, MIT |

Kokoro and Chatterbox model weights are not part of this repository or the installer. Their licences apply to the weights you download; read the model cards before redistributing generated audio.

## npm dependencies

${total} packages in the production dependency tree of \`code/\` (\`pnpm licenses list --prod\`), grouped by licence. Development tools (Vite+, TypeScript, Playwright and similar) are not shipped and are not listed.

Where a package offers a choice (for example \`MIT OR GPL-3.0-or-later\`), Speak Kit uses it under the permissive option.

${sections.join("\n")}
Regenerate this file with \`node tools/third-party-notices.mjs\`.
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== text) {
    console.error("THIRD_PARTY_NOTICES.md is out of date. Run: node tools/third-party-notices.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out} (${total} packages)`);
}
