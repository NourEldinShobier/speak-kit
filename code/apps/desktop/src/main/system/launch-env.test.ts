import { describe, expect, it } from "vite-plus/test";
import { launchEnv } from "./launch-env";

describe("launchEnv", () => {
  it("keeps ordinary variables and drops switches, settings and secrets", () => {
    const out = launchEnv({
      PATH: "/bin",
      Path: "C:/x",
      LOCALAPPDATA: "C:/Users/a",
      NODE_OPTIONS: "--inspect",
      ELECTRON_RUN_AS_NODE: "1",
      SPEAKKIT_PORT: "1",
      GITHUB_TOKEN: "t",
      AWS_SECRET_ACCESS_KEY: "s",
      OPENAI_API_KEY: "k",
      MY_PASSWORD: "p",
      EMPTY: undefined,
    });
    expect(out).toEqual({ PATH: "/bin", Path: "C:/x", LOCALAPPDATA: "C:/Users/a" });
  });
});
