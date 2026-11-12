import css from "./pill.css?inline";

/**
 * Voice chat: talk to the page by voice. The pieces here are pure (grid patterns, the session state machine, error mapping, the page prompt,
 * the idle timer, the one-session rule), the OpenAI Realtime connection (realtime.ts), the in-page pill and card and the options section.
 * The OpenAI key stays in the desktop app; this side holds only a short-lived client secret. Area: extension.
 */
export { VoiceChatSection } from "./VoiceChatSection";
export { askConsent } from "./consent";
export { SESSION_CAP_USD } from "./cost";
export { mayHaveChangedContent, pageChanged } from "./churn";
export { eventProblem, micProblem, type PillAction } from "./errors";
export { IdleTimer } from "./idle";
export { REALTIME_EVENTS, initialView, isLive, reduceVoice, type VoiceEvent } from "./machine";
export { Looker } from "./look";
export { MicLease } from "./lease";
export { mintSession } from "./mint";
export { MAX_PAGE_CHARS, buildInstructions, pageAddress } from "./page";
export { VoicePill } from "./pill";
export { OPENAI_BASE, Realtime, RealtimeFailure, type RealtimeEvent } from "./realtime";
export { SingleSession } from "./single";
export { Turns } from "./turns";
/** Stylesheet of the voice pill and the first-use card, injected into the Shadow DOM. */
export const VOICE_CSS: string = css;
