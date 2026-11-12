import { describe, expect, it } from "vitest";
import { BUILT_IN_PROVIDERS, CallTracker, Offers, allProviders, endPlan, parseLink, userProvider, windowMatches, type CallPolicy, type Probe } from "../src";

const tracker = (extra = [] as ReturnType<typeof allProviders>) => new CallTracker({ providers: () => allProviders(extra) });
const probe = (p: Partial<Probe>): Probe => ({ micUsers: [], windows: [], ...p });

describe("providers", () => {
  it("ships Teams, Zoom, Meet, Slack and Discord as data", () => {
    expect(BUILT_IN_PROVIDERS.map((p) => p.id)).toEqual(["teams", "zoom", "meet", "slack", "discord"]);
  });

  it("reads the meeting code, not the word meet, as a Google Meet call", () => {
    const meet = BUILT_IN_PROVIDERS.find((p) => p.id === "meet")!;
    expect(windowMatches(meet, { pid: 1, exe: "chrome", title: "Meet - abc-defg-hij - Google Chrome" })).toBe(true);
    expect(windowMatches(meet, { pid: 1, exe: "chrome", title: "How to meet your deadlines - Google Chrome" })).toBe(false);
    expect(windowMatches(meet, { pid: 1, exe: "notepad", title: "Meet - abc-defg-hij" })).toBe(false);
  });

  it("counts a Teams window of a browser (installed web app) as Teams", () => {
    const teams = BUILT_IN_PROVIDERS.find((p) => p.id === "teams")!;
    expect(windowMatches(teams, { pid: 2, exe: "msedge", title: "Standup | Microsoft Teams" })).toBe(true);
  });

  it("refuses a meeting link that is only a host or too short to name one meeting", () => {
    expect(parseLink("")).toEqual({ ok: false, problem: "empty" });
    expect(parseLink("hello")).toEqual({ ok: false, problem: "not-a-link" });
    expect(parseLink("https://meet.example.com")).toEqual({ ok: false, problem: "too-short" });
    expect(parseLink("meet.example.com/a")).toEqual({ ok: false, problem: "too-short" });
    expect(parseLink("ftp://meet.example.com/room-1234")).toEqual({ ok: false, problem: "not-a-link" });
    expect(parseLink("https://Meet.Example.com/room-1234/")).toEqual({ ok: true, host: "meet.example.com", path: "/room-1234" });
  });

  it("adds an app by process name, by link, or both, and keeps ids unique", () => {
    const a = userProvider({ name: "Whereby", link: "https://whereby.com/my-room-name" }, BUILT_IN_PROVIDERS);
    expect(a.ok && a.provider).toMatchObject({ id: "user-whereby", name: "Whereby", mark: "Wh", exes: [], inBrowser: true, links: [{ host: "whereby.com", path: "^/my-room-name$" }] });
    const again = userProvider({ name: "Whereby", exe: "Whereby.exe" }, a.ok ? [...BUILT_IN_PROVIDERS, a.provider] : []);
    expect(again.ok && again.provider).toMatchObject({ id: "user-whereby-2", exes: ["whereby"] });
    expect(userProvider({ name: " ", exe: "x" }, [])).toMatchObject({ ok: false, field: "name" });
    expect(userProvider({ name: "X" }, [])).toMatchObject({ ok: false, field: "app" });
    expect(userProvider({ name: "X", link: "https://x.com/a" }, [])).toMatchObject({ ok: false, field: "link", message: expect.stringContaining("too short") });
  });

  it("never lets an added app replace a built-in id", () => {
    const fake = { id: "zoom", name: "Not Zoom", mark: "Nz", exes: ["evil"] };
    expect(allProviders([fake]).find((p) => p.id === "zoom")!.name).toBe("Zoom");
  });
});

describe("call detection", () => {
  it("starts a session when a call app uses the microphone", () => {
    const t = tracker();
    const ev = t.update(probe({ micUsers: [{ pid: 10, exe: "zoom" }], windows: [{ pid: 10, exe: "zoom", title: "Zoom Meeting" }] }), 1000);
    expect(ev).toEqual([{ type: "started", session: { id: "zoom:10:1", providerId: "zoom", providerName: "Zoom", pid: 10, startedAt: 1000, title: "Zoom Meeting" } }]);
  });

  it("ignores a microphone user that is not a call app", () => {
    expect(tracker().update(probe({ micUsers: [{ pid: 3, exe: "obs64" }], windows: [{ pid: 3, exe: "obs64", title: "OBS" }] }), 0)).toEqual([]);
  });

  it("finds a Meet tab by browser, title and microphone", () => {
    const ev = tracker().update(probe({ micUsers: [{ pid: 50, exe: "chrome" }], windows: [{ pid: 9, exe: "chrome", title: "Meet - abc-defg-hij - Google Chrome" }] }), 5);
    expect(ev.map((e) => e.type === "started" && e.session.providerId)).toEqual(["meet"]);
  });

  it("does not call a page about meetings a call", () => {
    expect(tracker().update(probe({ micUsers: [{ pid: 50, exe: "chrome" }], windows: [{ pid: 9, exe: "chrome", title: "Meet the team - Company" }] }), 5)).toEqual([]);
  });

  it("keeps one session while the microphone flickers within the grace time, then ends it", () => {
    const t = tracker();
    const on = probe({ micUsers: [{ pid: 10, exe: "zoom" }], windows: [] });
    t.update(on, 0);
    expect(t.update(probe({}), 4000)).toEqual([]);
    expect(t.update(on, 5000)).toEqual([]);
    expect(t.update(probe({}), 6000)).toEqual([]);
    expect(t.update(probe({}), 11_000)).toEqual([{ type: "ended", sessionId: "zoom:10:1", providerId: "zoom" }]);
  });

  it("makes a new session for the same app's next call", () => {
    const t = tracker();
    const on = probe({ micUsers: [{ pid: 10, exe: "zoom" }] });
    t.update(on, 0);
    t.update(probe({}), 10_000);
    const ev = t.update(on, 20_000);
    expect(ev[0]).toMatchObject({ type: "started", session: { id: "zoom:10:2" } });
  });

  it("tracks two calls in two apps at once", () => {
    const t = tracker();
    const ev = t.update(
      probe({
        micUsers: [
          { pid: 1, exe: "zoom" },
          { pid: 2, exe: "slack" },
        ],
      }),
      0,
    );
    expect(ev.map((e) => e.type === "started" && e.session.providerId)).toEqual(["zoom", "slack"]);
    expect(t.sessions).toHaveLength(2);
  });
});

describe("offer", () => {
  const session = (id = "zoom:1:1", providerId = "zoom") => ({ id, providerId, providerName: "Zoom", pid: 1, startedAt: 0, title: "" });
  const make = (policies: Record<string, CallPolicy> = {}, enabled = true) => {
    const set: [string, CallPolicy][] = [];
    const o = new Offers({ enabled: () => enabled, policies: () => policies, setPolicy: (id, p) => set.push([id, p]) });
    return { o, set };
  };

  it("asks by default and keeps the offer until the call ends or it is answered (no timeout)", () => {
    const { o } = make();
    expect(o.started(session())).toEqual({ kind: "offer", session: session() });
    expect(o.shown).toHaveLength(1);
    expect(o.ended("zoom:1:1")).toBe(true);
    expect(o.shown).toEqual([]);
  });

  it("records without asking for Always record, and offers nothing for Never offer", () => {
    expect(make({ zoom: "always" }).o.started(session())).toEqual({ kind: "record", session: session() });
    expect(make({ zoom: "never" }).o.started(session())).toEqual({ kind: "none" });
  });

  it("offers nothing when the feature is off", () => {
    expect(make({}, false).o.started(session())).toEqual({ kind: "none" });
  });

  it("snoozes this call only: the next call of the same app is offered again", () => {
    const { o, set } = make();
    o.started(session("zoom:1:1"));
    o.dismissed("zoom:1:1", "this-call");
    expect(o.shown).toEqual([]);
    o.ended("zoom:1:1");
    expect(o.started(session("zoom:1:2"))).toMatchObject({ kind: "offer" });
    expect(set).toEqual([]);
  });

  it("sets Never offer for the app only when asked", () => {
    const { o, set } = make();
    o.started(session());
    o.dismissed("zoom:1:1", "never");
    expect(set).toEqual([["zoom", "never"]]);
  });

  it("a closed offer returns with the next call", () => {
    const { o } = make();
    o.started(session("a"));
    o.dismissed("a", "close");
    expect(o.started(session("b"))).toMatchObject({ kind: "offer" });
  });

  it("accepting marks the call as recorded and ends cleanly later", () => {
    const { o } = make();
    o.started(session());
    expect(o.accepted("zoom:1:1")?.id).toBe("zoom:1:1");
    expect(o.ended("zoom:1:1")).toBe(false);
    expect(o.accepted("missing")).toBeUndefined();
  });

  it("turning the feature off clears waiting offers", () => {
    const { o } = make();
    o.started(session("a"));
    o.started(session("b"));
    expect(o.clear().map((s) => s.id)).toEqual(["a", "b"]);
    expect(o.shown).toEqual([]);
  });
});

describe("when the call ends", () => {
  it("counts down when stop-on-end is on, asks when it is off, and leaves a hand-started recording alone", () => {
    expect(endPlan({ stopWhenEnds: true, forCall: true })).toEqual({ kind: "countdown", seconds: 15 });
    expect(endPlan({ stopWhenEnds: false, forCall: true })).toEqual({ kind: "ask" });
    expect(endPlan({ stopWhenEnds: true, forCall: false })).toEqual({ kind: "keep" });
  });
});
