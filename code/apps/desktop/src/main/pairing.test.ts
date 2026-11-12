import dc from "node:diagnostics_channel";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { APP_CLIENT_HEADER, authedCall, emptyPairing, watchPairing, watchPairingActivity } from "./pairing";

const req = (headers: Record<string, string>, localPort = 47615) => ({ headers, socket: { localPort } }) as never;
const bearer = { authorization: "Bearer secret" };

describe("authedCall", () => {
  it("accepts the right token on our port and returns the extension origin", () => {
    expect(authedCall(req({ ...bearer, origin: "chrome-extension://abc" }), "secret", 47615)).toEqual({ origin: "chrome-extension://abc" });
    expect(authedCall(req(bearer), "secret", 47615)).toEqual({ origin: "" });
  });

  it("ignores a wrong token, another port, no token set, and the app's own calls", () => {
    expect(authedCall(req({ authorization: "Bearer other" }), "secret", 47615)).toBeNull();
    expect(authedCall(req(bearer, 9999), "secret", 47615)).toBeNull();
    expect(authedCall(req(bearer), "", 47615)).toBeNull();
    expect(authedCall(req({ ...bearer, [APP_CLIENT_HEADER]: "1" }), "secret", 47615)).toBeNull();
  });
});

describe("watchPairing", () => {
  let stop = () => {};
  afterEach(() => stop());
  const publish = (headers: Record<string, string>) => dc.channel("http.server.request.start").publish({ request: req(headers) });

  it("records the first call, then only calls that are 5 s apart", () => {
    const p = emptyPairing();
    let t = 1000;
    let changes = 0;
    stop = watchPairing(p, { token: () => "secret", port: () => 47615, onChange: () => changes++, now: () => t });
    publish({ ...bearer, origin: "chrome-extension://abc" });
    t = 3000;
    publish(bearer);
    expect({ ...p, changes }).toEqual({ firstSeenMs: 1000, lastSeenMs: 1000, origin: "chrome-extension://abc", changes: 1 });
    t = 6000;
    publish(bearer);
    expect({ ...p, changes }).toEqual({ firstSeenMs: 1000, lastSeenMs: 6000, origin: "chrome-extension://abc", changes: 2 });
  });

  it("does not count a call with the wrong token as a pairing", () => {
    const p = emptyPairing();
    stop = watchPairing(p, { token: () => "secret", port: () => 47615, onChange: () => {}, now: () => 1 });
    publish({ authorization: "Bearer nope" });
    expect(p).toEqual(emptyPairing());
  });
});

describe("watchPairingActivity", () => {
  let stop = () => {};
  afterEach(() => stop());
  const publishCall = (headers: Record<string, string>) => dc.channel("http.server.request.start").publish({ request: req(headers) });

  it("adds one entry for the first call and publishes each change; the speakkit command (an app call) is not a browser", () => {
    const state = { pairing: emptyPairing(), token: "secret", port: 47615 };
    const added: string[] = [];
    let published = 0;
    stop = watchPairingActivity(state, { addActivity: (kind, title) => added.push(`${kind}:${title}`), publish: () => published++ });
    publishCall({ ...bearer, [APP_CLIENT_HEADER]: "1" });
    expect([added, published]).toEqual([[], 0]);
    publishCall({ ...bearer, origin: "chrome-extension://abc" });
    expect([added, published]).toEqual([["pair:Browser paired"], 1]);
  });
});
