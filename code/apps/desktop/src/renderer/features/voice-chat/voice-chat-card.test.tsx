import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "../../app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { VoiceChatCard, VoiceChatKeyRows } from "./VoiceChatCard";
import { cardReducer, initCard, keyLine, type CardAction, type CardState } from "./voice-chat-model";

const run = (actions: CardAction[], from: CardState = initCard()) => actions.reduce(cardReducer, from);
const rows = (st: CardState) => renderToStaticMarkup(<VoiceChatKeyRows st={st} dispatch={() => {}} />);
const NO_KEY = { hasKey: false, canEncrypt: true };
const SAVED = { hasKey: true, canEncrypt: true };
const KEY = "sk-proj-Card_Key-0123456789abcdef";

describe("card state", () => {
  it("starts without a key and says so", () => {
    const st = run([{ type: "loaded", status: NO_KEY }]);
    expect(keyLine(st)).toBe("No key saved");
    expect(st.notice).toBeNull();
  });

  it("saving clears the typed key and shows it as saved", () => {
    const st = run([{ type: "loaded", status: NO_KEY }, { type: "draft", text: KEY }, { type: "reveal" }, { type: "busy", what: "save" }, { type: "saved", result: { ok: true } }]);
    expect(st).toMatchObject({ status: SAVED, draft: "", reveal: false, busy: null, notice: { tone: "ok", text: "Key saved" } });
    expect(JSON.stringify(st)).not.toContain(KEY);
  });

  it("walks through testing, then accepted", () => {
    const testing = run([
      { type: "loaded", status: SAVED },
      { type: "busy", what: "test" },
    ]);
    expect(testing).toMatchObject({ busy: "test", notice: { tone: "info" } });
    expect(run([{ type: "tested", result: { ok: true } }], testing)).toMatchObject({ busy: null, notice: { tone: "ok", text: "OpenAI accepted this key" } });
  });

  it.each([
    ["key-rejected", "OpenAI did not accept this key"],
    ["no-credit", "Your OpenAI account has no credit"],
    ["rate-limited", "OpenAI is limiting requests right now. Try again in a minute."],
    ["offline", "Speak Kit could not reach OpenAI. Check your internet connection."],
  ] as const)("a test that fails with %s says %s", (code, text) => {
    expect(
      run([
        { type: "busy", what: "test" },
        { type: "tested", result: { ok: false, code } },
      ]).notice,
    ).toEqual({ tone: "error", text });
  });

  it("a computer that cannot encrypt is remembered, and the key stays unsaved", () => {
    const st = run([
      { type: "loaded", status: NO_KEY },
      { type: "draft", text: KEY },
      { type: "busy", what: "save" },
      { type: "saved", result: { ok: false, code: "encryption-unavailable" } },
    ]);
    expect(st.status).toEqual({ hasKey: false, canEncrypt: false });
    expect(st.notice?.text).toBe("This computer cannot encrypt secrets, so Speak Kit cannot store a key here.");
  });

  it("removing the key returns to no key and drops anything typed", () => {
    expect(
      run([
        { type: "draft", text: "sk-x" },
        { type: "busy", what: "remove" },
        { type: "removed", status: NO_KEY },
      ]),
    ).toMatchObject({ status: NO_KEY, draft: "", notice: { text: "Key removed" } });
  });

  it("the show button goes away with the typed text", () => {
    expect(run([{ type: "draft", text: "sk-x" }, { type: "reveal" }, { type: "draft", text: "" }]).reveal).toBe(false);
  });
});

describe("one operation at a time", () => {
  it("a result that does not belong to the operation in flight is ignored", () => {
    const testing = run([
      { type: "loaded", status: SAVED },
      { type: "busy", what: "test" },
    ]);
    expect(run([{ type: "saved", result: { ok: true } }], testing)).toBe(testing);
    expect(run([{ type: "removed", status: NO_KEY }], testing)).toBe(testing);
    const idle = run([{ type: "tested", result: { ok: true } }], testing);
    expect(run([{ type: "tested", result: { ok: false, code: "key-rejected" } }], idle)).toBe(idle); // a late second answer
  });

  it("while busy the field and every button are disabled", () => {
    const html = rows(
      run([
        { type: "loaded", status: SAVED },
        { type: "draft", text: KEY },
        { type: "busy", what: "save" },
      ]),
    );
    expect(html).toMatch(/<input[^>]*disabled/);
    expect((html.match(/<button[^>]*disabled/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("card markup", () => {
  it("no key: a password field, Save and the helper text; Test key and Remove key are off", () => {
    const html = rows(run([{ type: "loaded", status: NO_KEY }]));
    expect(html).toContain('type="password"');
    expect(html).toContain("Stored on this computer, encrypted by your operating system. Sent only to OpenAI.");
    expect(html).toContain('for="voice-chat-key"');
    expect(html).not.toContain("Show key");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Test key/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Remove key/);
  });

  it("saved: the field is empty with the placeholder Saved and the actions are on", () => {
    const html = rows(run([{ type: "loaded", status: SAVED }]));
    expect(html).toContain('placeholder="Saved"');
    expect(html).toContain('value=""');
    expect(html).toContain("Key saved");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Test key/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Remove key/);
  });

  it("typing: the show button appears and flips the field to text", () => {
    const typing = run([
      { type: "loaded", status: NO_KEY },
      { type: "draft", text: KEY },
    ]);
    expect(rows(typing)).toContain('aria-label="Show key"');
    const shown = rows(run([{ type: "reveal" }], typing));
    expect(shown).toContain('aria-label="Hide key"');
    expect(shown).toContain('type="text"');
  });

  it("testing: the Test key button is busy and the status line says what happens", () => {
    const html = rows(
      run([
        { type: "loaded", status: SAVED },
        { type: "busy", what: "test" },
      ]),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Checking the key with OpenAI");
    expect(html).toContain('role="status"');
  });

  it("rejected and no credit are shown as the status line", () => {
    expect(
      rows(
        run([
          { type: "loaded", status: SAVED },
          { type: "busy", what: "test" },
          { type: "tested", result: { ok: false, code: "key-rejected" } },
        ]),
      ),
    ).toContain("OpenAI did not accept this key");
    expect(
      rows(
        run([
          { type: "loaded", status: SAVED },
          { type: "busy", what: "test" },
          { type: "tested", result: { ok: false, code: "no-credit" } },
        ]),
      ),
    ).toContain("Your OpenAI account has no credit");
  });

  it("encryption unavailable: the field and Save are off and the reason is shown", () => {
    const html = rows(run([{ type: "loaded", status: { hasKey: false, canEncrypt: false } }]));
    expect(html).toContain("This computer cannot encrypt secrets");
    expect(html).not.toContain("Stored on this computer");
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it("the whole card lists the voice and the model as plain text", () => {
    const html = renderToStaticMarkup(<VoiceChatCard s={appState()} />);
    expect(html).toContain("Voice chat");
    expect(html).toContain("Model: gpt-realtime-2.1");
    expect(html).toContain("Marin");
  });
});
