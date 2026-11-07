import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("e2e/groups.json", () => {
  it("lists every spec file in exactly one group", () => {
    const groups = JSON.parse(readFileSync(new URL("../e2e/groups.json", import.meta.url), "utf8")).groups;
    const listed = Object.values(groups).flatMap((g) => g.specs);
    const onDisk = readdirSync(new URL("../e2e/tests/", import.meta.url)).filter((f) => f.endsWith(".spec.ts"));
    expect([...listed].sort()).toEqual([...onDisk].sort());
  });
});
