import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillFs } from "./index";

export const nodeSkillFs: SkillFs = {
  async read(file) {
    try {
      return await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  },
  async write(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  },
};
