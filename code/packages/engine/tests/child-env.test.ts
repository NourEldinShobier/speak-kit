import { describe, expect, it } from "vite-plus/test";
import { childEnv } from "../src/child-env";

describe("childEnv", () => {
  it("keeps the allowlisted variables and drops the rest", () => {
    const source = {
      Path: "C:/bin",
      SystemRoot: "C:/Windows",
      TEMP: "C:/tmp",
      HF_HOME: "D:/hf",
      SPEAKKIT_TOKEN: "t",
      ELECTRON_RUN_AS_NODE: "1",
      GITHUB_TOKEN: "secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      NODE_OPTIONS: "--inspect",
      CUDA_VISIBLE_DEVICES: "0",
      PYTHONPATH: "x",
    };
    expect(childEnv({}, source)).toEqual({
      Path: "C:/bin",
      SystemRoot: "C:/Windows",
      TEMP: "C:/tmp",
      HF_HOME: "D:/hf",
      SPEAKKIT_TOKEN: "t",
      ELECTRON_RUN_AS_NODE: "1",
    });
  });

  it("matches names case-insensitively and keeps their spelling", () => {
    expect(childEnv({}, { path: "/usr/bin", https_proxy: "http://p:3128", hf_hub_offline: "1" })).toEqual({ path: "/usr/bin", https_proxy: "http://p:3128", hf_hub_offline: "1" });
  });

  it("adds the extra variables, which win over inherited ones", () => {
    expect(childEnv({ HF_HOME: "new", EXTRA: "1" }, { HF_HOME: "old", PATH: "p" })).toEqual({ HF_HOME: "new", EXTRA: "1", PATH: "p" });
  });

  it("reads this process's environment by default", () => {
    process.env.GITHUB_TOKEN_FOR_TEST = "secret";
    try {
      expect(childEnv()).not.toHaveProperty("GITHUB_TOKEN_FOR_TEST");
      expect(Object.keys(childEnv()).some((k) => k.toUpperCase() === "PATH")).toBe(true);
    } finally {
      delete process.env.GITHUB_TOKEN_FOR_TEST;
    }
  });
});
