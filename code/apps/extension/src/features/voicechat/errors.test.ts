import { describe, expect, it } from "vite-plus/test";
import { PROBLEMS, eventProblem, micProblem, openAiCode, openAiProblem } from "./errors";

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
  it("ends the conversation for quota, key and rate limit errors and ignores only the harmless ones", () => {
    expect(eventProblem({ type: "error", error: { code: "insufficient_quota" } })).toBe("no-credit");
    expect(eventProblem({ type: "error", error: { code: "rate_limit_exceeded" } })).toBe("rate-limited");
    expect(eventProblem({ type: "error", error: { code: "input_audio_buffer_commit_empty" } })).toBeUndefined();
    expect(eventProblem({ type: "error", error: { code: "response_cancel_not_active" } })).toBeUndefined();
  });

  it("shows an unknown error, such as a rejected session.update, as unavailable instead of dropping it", () => {
    expect(eventProblem({ type: "error", error: { type: "invalid_request_error", code: "unknown_parameter", message: "secret page text" } })).toBe("unavailable");
    expect(eventProblem({ type: "error", error: { message: "no code at all" } })).toBe("unavailable");
  });
});

describe("micProblem", () => {
  it("a missing, busy or unusable device is mic-missing; a refusal is mic-blocked", () => {
    for (const name of ["NotFoundError", "NotReadableError", "OverconstrainedError"]) expect(micProblem({ name })).toBe("mic-missing");
    for (const name of ["NotAllowedError", "SecurityError", "Whatever"]) expect(micProblem({ name })).toBe("mic-blocked");
    expect(micProblem(undefined)).toBe("mic-blocked");
  });
});

describe("PROBLEMS", () => {
  it("has the texts and actions of the design", () => {
    expect(PROBLEMS["no-key"]).toEqual({ text: "Add your API key", label: "Set up", action: "set-up" });
    expect(PROBLEMS["mic-blocked"]).toEqual({ text: "Microphone blocked", label: "How to allow", action: "allow-mic" });
    expect(PROBLEMS["mic-missing"]).toEqual({ text: "No microphone found", label: "Retry", action: "retry" });
    expect(PROBLEMS["too-long"]).toEqual({ text: "Page is too long", label: "Use selection", action: "use-selection" });
    expect(PROBLEMS["page-changed"].label).toBe("Update");
    expect(PROBLEMS.unreadable.text).toBe("Cannot read this page");
  });
});
