import { act } from "react";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { installDom, mount, text, typeInto } from "../../testing/dom";
import { ConnectionCard } from "./ConnectionCard";

beforeEach(installDom);

const offline = { ok: false, error: "app-not-running" } as const;
const rejected = { ok: false, error: "token-rejected", detail: "401" } as const;

describe("ConnectionCard", () => {
  test("has no port field and no reveal, copy or re-pair buttons; the token is one field", async () => {
    const m = await mount(<ConnectionCard health={offline} refresh={vi.fn()} token="abcd1234efgh5678" setToken={vi.fn()} />);
    expect(m.root.querySelector("#port")).toBeNull();
    expect([...m.root.querySelectorAll("button")].map(text)).toEqual(["Test connection", "Download app", "Open Speak Kit", "Copy details"]);
    expect(m.root.querySelector("[aria-label='Reveal token']")).toBeNull();
    expect((m.root.querySelector("#token") as HTMLInputElement).value).toBe("••••••••5678");
    expect(m.root.textContent).not.toContain("abcd1234efgh5678");
    await m.unmount();
  });

  test("a pasted token is saved and the connection tested; a rejected token waits empty for a new one", async () => {
    const setToken = vi.fn();
    const refresh = vi.fn(async () => offline);
    const m = await mount(<ConnectionCard health={rejected} refresh={refresh} token="old-token-value-1234" setToken={setToken} />);
    const input = m.root.querySelector("#token") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(text(m.root.querySelector(".lm-field__error"))).toBe("Token rejected. Copy a new one from Speak Kit > Settings > Browser integration.");
    await typeInto(input, "  new-token-value-5678  ");
    await act(async () => void input.dispatchEvent(new Event("focusout", { bubbles: true })));
    expect(setToken).toHaveBeenCalledWith("new-token-value-5678");
    expect(refresh).toHaveBeenCalledTimes(1);
    await m.unmount();
  });
});
