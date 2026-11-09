import { describe, expect, it } from "vite-plus/test";
import { PROBLEMS, eventProblem, openAiCode, openAiProblem } from "./errors";

describe("openAiProblem", () => {
  it("maps an invalid key, no quota, a rate limit and a network failure to their pills", () => {
    expect(openAiProblem({ status: 401 })).toBe("key-rejected");
    expect(openAiProblem({ status: 400, code: "invalid_api_key" })).toBe("key-rejected");
    expect(openAiProblem({ status: 429, code: "insufficient_quota" })).toBe("no-credit");
    expect(openAiProblem({ status: 429, code: "rate_limit_exceeded" })).toBe("rate-limited");
    expect(openAiProblem({ network: true })).toBe("offline");
    expect(openAiProblem({ status: 503 })).toBe("unavailable");
  });
});

describe("openAiCode", () => {
  it("reads the code, falls back to the type and never returns message text", () => {
    expect(openAiCode({ error: { code: "insufficient_quota", message: "You exceeded sk-live-secret" } })).toBe("insufficient_quota");
    expect(openAiCode({ error: { type: "invalid_request_error", message: "x" } })).toBe("invalid_request_error");
    expect(openAiCode({ error: { message: "only a message" } })).toBeUndefined();
    expect(openAiCode("nope")).toBeUndefined();
  });
});

describe("eventProblem", () => {
  it("ends the conversation for quota, key and rate limit errors and ignores the rest", () => {
    expect(eventProblem({ type: "error", error: { code: "insufficient_quota" } })).toBe("no-credit");
    expect(eventProblem({ type: "error", error: { code: "rate_limit_exceeded" } })).toBe("rate-limited");
    expect(eventProblem({ type: "error", error: { code: "input_audio_buffer_commit_empty" } })).toBeUndefined();
  });
});

describe("PROBLEMS", () => {
  it("has the texts and actions of the design", () => {
    expect(PROBLEMS["no-key"]).toEqual({ text: "Add your API key", label: "Set up", action: "set-up" });
    expect(PROBLEMS["mic-blocked"]).toEqual({ text: "Microphone blocked", label: "How to allow", action: "allow-mic" });
    expect(PROBLEMS["too-long"]).toEqual({ text: "Page is too long", label: "Use selection", action: "use-selection" });
    expect(PROBLEMS["page-changed"].label).toBe("Update");
    expect(PROBLEMS.unreadable.text).toBe("Cannot read this page");
  });
});
