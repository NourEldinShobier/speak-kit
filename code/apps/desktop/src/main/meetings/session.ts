import { LoopbackSupervisor, MicGuard, MicPicker, type Failure, type Meetings, type Outcome } from "@speakkit/meetings";
import { ignore } from "./ignore";
import type { RecordingView, SystemAudio } from "../../shared/meetings/contract";
import type { RecorderPort } from "./hosts";

export interface SessionDeps {
  core: Meetings;
  recorder: RecorderPort;
  picker: MicPicker;
  now(): number;
  /** The microphone setting and whether to record the system's sound. */
  micSetting(): string;
  /** The view for the windows, or null when nothing records. */
  changed(view: RecordingView | null): void;
  /** Something the person should read about a recording that ended by itself. */
  notice(text: string): void;
  maxSeconds?: number;
}

const MIC_MESSAGES: Record<string, string> = {
  "mic-denied": "Speak Kit cannot use the microphone. Allow it in your system's privacy settings and try again.",
  "mic-missing": "No microphone was found. Connect one and try again.",
  "mic-busy": "The microphone is in use by another program. Close it and try again.",
  "mic-failed": "The recording could not be started. Try again.",
};

const NO_SYSTEM = "The sound of the call could not be recorded on this computer, so only your microphone is in the recording.";
const fallbackNote = (why: string | undefined) => (why === "fallback" ? FALLBACK_MIC : undefined);
const FALLBACK_MIC = "The system could not say which microphone the call app uses, so the saved microphone is used.";
const SIX_HOURS = 6 * 3600;
const SOUND = 0.02;

/**
 * One meeting recording at a time: the meeting is created, the hidden page opens the microphone and the system's sound, and every block of audio goes to the
 * meeting's two tracks as it arrives. The recording ends by itself, keeping everything recorded, when the disk is full, the microphone goes away or the time
 * limit is reached. The system's sound is opened once; a glitch in it is a gap in time, and only a stream that ended is opened again (at most every 5 s).
 */
export class MeetingRecording {
  readonly #d: SessionDeps;
  readonly #guard = new MicGuard();
  readonly #loopback = new LoopbackSupervisor();
  #id: string | undefined;
  #app = "";
  #forSession: string | undefined;
  #phase: RecordingView["phase"] | undefined;
  #startedAt = 0;
  #levels = { you: 0, them: 0 };
  #system: SystemAudio = "off";
  #note: string | undefined;
  #pending: Promise<unknown> = Promise.resolve();
  #ending: Promise<Outcome<{ id: string }>> | undefined;
  #reason: string | undefined;

  constructor(deps: SessionDeps) {
    this.#d = deps;
    deps.recorder.onChunk((track, pcm, at) => this.#chunk(track, pcm, at));
    deps.recorder.onLevel((track, n) => (this.#levels[track] = n));
    deps.recorder.onEnded((track) => void this.#ended(track));
  }

  get active(): boolean {
    return this.#phase !== undefined;
  }

  /** The call this recording belongs to; undefined for one started by hand. */
  get session(): string | undefined {
    return this.#forSession;
  }

  view(): RecordingView | null {
    if (!this.#phase) return null;
    const live = this.#phase === "recording";
    return {
      id: this.#id ?? null,
      phase: this.#phase,
      app: this.#app,
      seconds: live ? Math.max(0, Math.floor((this.#d.now() - this.#startedAt) / 1000)) : 0,
      you: live ? this.#levels.you : 0,
      them: live ? this.#levels.them : 0,
      micSilent: this.#guard.state === "silent",
      system: this.#system,
      ...(this.#note && { note: this.#note }),
    };
  }

  /** Called every second while recording: refreshes the silent-microphone guard and the windows. */
  tick(): void {
    if (this.#phase !== "recording") return;
    const now = this.#d.now();
    this.#guard.feed(now, this.#levels.you, this.#levels.them);
    if (this.#levels.you >= SOUND || this.#levels.them >= SOUND) this.#note = this.#note === NO_SYSTEM || this.#note === FALLBACK_MIC ? this.#note : undefined;
    if ((now - this.#startedAt) / 1000 >= (this.#d.maxSeconds ?? SIX_HOURS)) void this.#autoStop("The recording reached its time limit. It is saved and is being transcribed.");
    this.#d.changed(this.view());
  }

  async start(app: { providerId: string; providerName: string; sessionId?: string }): Promise<Outcome<{ id: string }>> {
    if (this.#phase) return { ok: false, failure: { code: "busy", message: "A meeting is already being recorded." } };
    this.#phase = "starting";
    this.#app = app.providerName;
    this.#forSession = app.sessionId;
    this.#levels = { you: 0, them: 0 };
    this.#system = "off";
    this.#note = undefined;
    this.#reason = undefined;
    this.#d.changed(this.view());
    const begun = await this.#d.core.begin({ providerId: app.providerId, providerName: app.providerName });
    if (!begun.ok) return this.#abandon(begun.failure);
    const id = (this.#id = begun.id);
    const mic = await this.#d.picker.choose(this.#d.micSetting());
    const r = await this.#d.recorder.start({ micDevice: mic.device, system: true }).catch(() => ({ ok: false as const, code: "mic-failed" as const }));
    // Stopped by hand while the microphone was still opening: stop() already owns the meeting, so the late answer only closes what it opened.
    if (this.#phase !== "starting") {
      if (r.ok) await this.#d.recorder.stop().catch(ignore);
      return { ok: false, failure: { code: "stopped", message: "The recording was stopped before it started." } };
    }
    if (!r.ok) {
      // A start that timed out may still open the microphone later: close the page so the microphone is never left on.
      await this.#d.recorder.stop().catch(ignore);
      await this.#d.core.remove(id, { abandon: true }).catch(ignore);
      return this.#abandon({ code: r.code, message: MIC_MESSAGES[r.code] ?? MIC_MESSAGES["mic-failed"]! });
    }
    this.#system = r.system ?? "unavailable";
    this.#note = this.#system === "unavailable" ? NO_SYSTEM : fallbackNote(mic.why);
    this.#startedAt = this.#d.now();
    this.#phase = "recording";
    this.#d.changed(this.view());
    return { ok: true, id };
  }

  #abandon(failure: Failure): { ok: false; failure: Failure } {
    this.#phase = undefined;
    this.#id = undefined;
    this.#forSession = undefined;
    this.#d.changed(null);
    return { ok: false, failure };
  }

  #chunk(track: "you" | "them", pcm: Int16Array, at: number): void {
    if ((this.#phase !== "recording" && this.#phase !== "saving") || !this.#id) return;
    const id = this.#id;
    const lost = () => void this.#autoStop("Recording stopped because it could not be saved. What was recorded so far is kept.");
    this.#pending = this.#pending.then(async () => {
      const r = await this.#d.core.append(id, track, pcm, at).catch(() => undefined);
      if (!r) return lost();
      if (!r.ok)
        void this.#autoStop(
          r.failure.code === "disk-full" ? "The disk is full. What was recorded so far is saved." : "Recording stopped because it could not be saved. What was recorded so far is kept.",
        );
    });
  }

  async #ended(track: "you" | "them"): Promise<void> {
    if (this.#phase !== "recording") return;
    if (track === "you") return void (await this.#autoStop("The microphone was disconnected. What was recorded is saved."));
    if (this.#loopback.ended(this.#d.now()) === "wait") return;
    const r = await this.#d.recorder.reopenSystem().catch(ignore);
    if (!r || !r.ok || r.system !== "on") {
      this.#system = "unavailable";
      this.#note = NO_SYSTEM;
    }
    this.#d.changed(this.view());
  }

  #autoStop(reason: string): Promise<Outcome<{ id: string }>> {
    this.#reason ??= reason;
    return this.stop();
  }

  /** Stops, waits for the last blocks to be written, then lets the meeting finish its audio and start its transcript. Calling it again while it runs returns the same answer. */
  stop(): Promise<Outcome<{ id: string }>> {
    if (this.#ending) return this.#ending;
    const id = this.#id;
    if (!this.#phase || !id) return Promise.resolve({ ok: false, failure: { code: "idle", message: "Nothing is being recorded." } });
    this.#phase = "saving";
    this.#d.changed(this.view());
    this.#ending = (async (): Promise<Outcome<{ id: string }>> => {
      let r: Outcome<{ id: string }>;
      try {
        await this.#d.recorder.stop().catch(ignore);
        await this.#pending;
        r = await this.#d.core.end(id);
      } catch {
        r = { ok: false, failure: { code: "finalise-failed", message: "The recording could not be finished. What was recorded so far is kept." } };
      }
      this.#phase = undefined;
      this.#id = undefined;
      this.#forSession = undefined;
      this.#ending = undefined;
      this.#d.changed(null);
      if (this.#reason) this.#d.notice(this.#reason);
      return r;
    })();
    return this.#ending;
  }
}
