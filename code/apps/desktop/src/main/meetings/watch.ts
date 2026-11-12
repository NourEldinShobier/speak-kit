import { CallTracker, endPlan, Offers, type CallPolicy, type CallSession, type Provider } from "@speakkit/meetings";
import type { CapsuleAction, CapsuleView, RecordingView } from "../../shared/meetings/contract";
import type { MeetingsConfig } from "../../shared/meetings/settings";
import type { MeetingRecording } from "./session";
import type { MeetingsPlatform } from "./platform/types";

export interface WatchDeps {
  platform: MeetingsPlatform;
  providers(): Provider[];
  cfg(): MeetingsConfig;
  setPolicy(providerId: string, policy: CallPolicy): void;
  recording: Pick<MeetingRecording, "active" | "session" | "start" | "stop" | "view">;
  show(view: CapsuleView | null): void;
  now(): number;
  /** Opens a meeting in the app window / shows its files in the folder. */
  open(id: string): void;
  showFolder(id: string): void;
  /** Opens Settings > Meetings (the "Never offer" choice sends the person there). */
  openSettings(): void;
}

const SAVED_MS = 20_000;

/**
 * Notices calls and speaks for them in the capsule. A poll asks the system who uses the microphone; a started call gets an offer (or, for "Always record", is
 * recorded), an ended call takes its offer away and, when it was being recorded, starts the call-ended prompt (a countdown, or a question when
 * "stop when the call ends" is off). One thing is shown at a time: the call-ended prompt, then an offer, then the recording, then the notice that a transcript is ready.
 * Nothing is recorded because time passed.
 */
export class CallWatch {
  readonly #d: WatchDeps;
  readonly #tracker: CallTracker;
  readonly #offers: Offers;
  readonly #sessions = new Map<string, CallSession>();
  #ending: { sessionId: string; app: string; left: number | null } | undefined;
  #saved: { id: string; title: string; mark: string; until: number } | undefined;
  #notice: string | undefined;

  constructor(d: WatchDeps) {
    this.#d = d;
    this.#tracker = new CallTracker({ providers: d.providers });
    this.#offers = new Offers({ enabled: () => d.cfg().enabled, policies: () => d.cfg().policies, setPolicy: d.setPolicy });
  }

  /** Whether the system can tell calls from microphone use at all. */
  get canDetect(): boolean {
    return this.#d.platform.capabilities().callDetection === "available";
  }

  /** The call being recorded or waiting for an answer, for the settings page. */
  get activeCall(): { name: string } | undefined {
    const s = this.#tracker.sessions[0];
    return s ? { name: s.providerName } : undefined;
  }

  /** One look at the system. */
  async poll(): Promise<void> {
    if (!this.#d.cfg().enabled || !this.canDetect) return this.#idle();
    const probe = await this.#d.platform.probe();
    for (const e of this.#tracker.update(probe, this.#d.now())) {
      if (e.type === "started") this.#started(e.session);
      else this.#callEnded(e.sessionId);
    }
    this.render();
  }

  #idle(): void {
    for (const s of this.#offers.clear()) this.#sessions.delete(s.id);
    this.render();
  }

  #started(session: CallSession): void {
    this.#sessions.set(session.id, session);
    // A call that starts while something is being recorded is not offered: one recording at a time.
    if (this.#d.recording.active) return;
    const action = this.#offers.started(session);
    if (action.kind === "record") void this.#d.recording.start({ providerId: session.providerId, providerName: session.providerName, sessionId: session.id, pid: session.pid });
  }

  #callEnded(sessionId: string): void {
    this.#offers.ended(sessionId);
    this.#sessions.delete(sessionId);
    if (this.#d.recording.session !== sessionId) return;
    const plan = endPlan({ stopWhenEnds: this.#d.cfg().stopWhenEnds, forCall: true });
    const app = this.#d.recording.view()?.app ?? "";
    if (plan.kind === "countdown") this.#ending = { sessionId, app, left: plan.seconds };
    else if (plan.kind === "ask") this.#ending = { sessionId, app, left: null };
  }

  /** Once a second: counts the call-ended prompt down, expires the "ready" notice. */
  tick(): void {
    // A recording stopped by hand (shortcut, tray) while the call-ended prompt shows: the prompt has nothing left to stop.
    if (this.#ending && !this.#d.recording.active) this.#ending = undefined;
    const e = this.#ending;
    if (e && e.left !== null) {
      e.left -= 1;
      if (e.left <= 0) void this.#stop();
    }
    if (this.#saved && this.#d.now() >= this.#saved.until) this.#saved = undefined;
    this.render();
  }

  async #stop(): Promise<void> {
    this.#ending = undefined;
    await this.#d.recording.stop();
    this.render();
  }

  /** A transcript is ready: the capsule says so for a while, with a way to the files. */
  finished(id: string, title: string, mark: string): void {
    this.#saved = { id, title, mark, until: this.#d.now() + SAVED_MS };
    this.render();
  }

  notice(text: string | undefined): void {
    this.#notice = text;
    this.render();
  }

  async act(a: CapsuleAction): Promise<void> {
    switch (a.type) {
      case "record": {
        const s = this.#sessions.get(a.sessionId);
        this.#offers.accepted(a.sessionId);
        if (s) await this.#d.recording.start({ providerId: s.providerId, providerName: s.providerName, sessionId: s.id, pid: s.pid });
        break;
      }
      case "dismiss":
        // "Never offer" saves the policy for the app and opens Settings, where the person sees and can undo it.
        this.#offers.dismissed(a.sessionId, a.how);
        if (a.how === "never") this.#d.openSettings();
        break;
      case "stop":
        await this.#stop();
        break;
      case "keep":
        // The meeting goes on: the prompt closes and this call's end is not asked about again.
        this.#ending = undefined;
        break;
      case "close":
        this.#saved = undefined;
        this.#notice = undefined;
        break;
      case "show-folder":
        this.#d.showFolder(a.id);
        this.#saved = undefined;
        break;
      case "open":
        this.#d.open(a.id);
        this.#saved = undefined;
        break;
    }
    this.render();
  }

  /** Works out the one thing the capsule shows and gives it to the window. */
  render(): void {
    this.#d.show(this.#view());
  }

  #view(): CapsuleView | null {
    if (this.#ending) return { kind: "ending", sessionId: this.#ending.sessionId, app: this.#ending.app, secondsLeft: this.#ending.left };
    const offer = this.#offers.shown[0];
    if (offer && !this.#d.recording.active) return { kind: "offer", sessionId: offer.id, app: offer.providerName, mark: this.#d.providers().find((p) => p.id === offer.providerId)?.mark ?? "Mt" };
    const r: RecordingView | null = this.#d.recording.view();
    if (r && r.phase !== "saving") return { kind: "recording", app: r.app, seconds: r.seconds, you: r.you, them: r.them, micSilent: r.micSilent, system: r.system, ...(r.note && { note: r.note }) };
    if (this.#notice) return { kind: "notice", text: this.#notice };
    if (this.#saved) return { kind: "saved", id: this.#saved.id, title: this.#saved.title, mark: this.#saved.mark };
    return null;
  }
}
