/**
 * Voice chat: talk to the page by voice. The pieces here are pure (grid patterns, the session state machine, error mapping, the page prompt,
 * the idle timer, the one-session rule), the OpenAI Realtime connection (realtime.ts), the in-page pill and card and the options section.
 * The OpenAI key stays in the desktop app; this side holds only a short-lived client secret. Area: extension.
 */
export { VoiceChatSection } from "./VoiceChatSection";
