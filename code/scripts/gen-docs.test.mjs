import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { claudeRuleCount, modulesDoc, scan, violations } from "./gen-docs.mjs";

const root = mkdtempSync(join(tmpdir(), "gen-docs-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

put("packages/protocol/src/index.ts", "/** Wire types.\n * Does not do I/O. */\nexport const a = 1;\n");
put("packages/protocol/src/bad.ts", 'import { x } from "@speakkit/engine";\nexport const b = x;\n');
put("packages/engine/src/index.ts", 'import type { a } from "@speakkit/protocol";\nexport type T = typeof a;\n');
put("apps/desktop/src/renderer/App.tsx", 'import { m } from "../main/x";\nexport const App = m;\n');
put("apps/desktop/src/renderer/ok.tsx", 'import { s } from "../shared/y";\nexport const ok = s;\n');
put("apps/desktop/src/renderer/App.test.tsx", 'import { m } from "../main/x";\nexport const t = m;\n');
put("apps/extension/src/app/popup/P.tsx", 'import("../../features/queue/deep/file");\nimport { q } from "../../features/queue";\n');

describe("gen-docs", () => {
  const files = scan(root);

  it("reports package-graph and path-rule violations in non-test files only", () => {
    expect(violations(root, files)).toEqual([
      { file: "apps/desktop/src/renderer/App.tsx", spec: "../main/x", rule: "renderer-not-main" },
      { file: "apps/extension/src/app/popup/P.tsx", spec: "../../features/queue/deep/file", rule: "app-uses-feature-index" },
      { file: "packages/protocol/src/bad.ts", spec: "@speakkit/engine", rule: "package-graph: packages/protocol may not import packages/engine" },
    ]);
  });

  it("writes the interface header and area table of a unit", () => {
    expect(modulesDoc(root, files)).toContain("Interface (`src/index.ts` header): Wire types. Does not do I/O.");
  });

  it("counts the numbered rules under the Rules heading", () => {
    expect(claudeRuleCount("# T\n1. no\n## Rules\n1. a\n2. b\n\n3. c\n")).toBe(3);
  });
});
