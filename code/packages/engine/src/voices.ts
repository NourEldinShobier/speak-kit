import type { Voice } from "@speakkit/protocol";

// [id, name, gender, overall grade from kokoro-js, traits]. Grades A-F+ collapse to A..D (D covers D and F).
const T: [string, string, "female" | "male", string, string?][] = [
  ["af_heart", "Heart", "female", "A", "❤️"],
  ["af_bella", "Bella", "female", "A-", "🔥"],
  ["af_nicole", "Nicole", "female", "B-", "🎧"],
  ["af_aoede", "Aoede", "female", "C+"],
  ["af_kore", "Kore", "female", "C+"],
  ["af_sarah", "Sarah", "female", "C+"],
  ["af_alloy", "Alloy", "female", "C"],
  ["af_nova", "Nova", "female", "C"],
  ["af_sky", "Sky", "female", "C-"],
  ["af_jessica", "Jessica", "female", "D"],
  ["af_river", "River", "female", "D"],
  ["am_fenrir", "Fenrir", "male", "C+"],
  ["am_michael", "Michael", "male", "C+"],
  ["am_puck", "Puck", "male", "C+"],
  ["am_echo", "Echo", "male", "D"],
  ["am_eric", "Eric", "male", "D"],
  ["am_liam", "Liam", "male", "D"],
  ["am_onyx", "Onyx", "male", "D"],
  ["am_santa", "Santa", "male", "D-"],
  ["am_adam", "Adam", "male", "F+"],
  ["bf_emma", "Emma", "female", "B-", "🚺"],
  ["bf_isabella", "Isabella", "female", "C"],
  ["bf_alice", "Alice", "female", "D", "🚺"],
  ["bf_lily", "Lily", "female", "D", "🚺"],
  ["bm_george", "George", "male", "C"],
  ["bm_fable", "Fable", "male", "C", "🚹"],
  ["bm_lewis", "Lewis", "male", "D+"],
  ["bm_daniel", "Daniel", "male", "D", "🚹"],
];

export const KOKORO_VOICES: Voice[] = T.map(([id, name, gender, grade, traits]) => ({
  id,
  name,
  lang: id.startsWith("b") ? "en-GB" : "en-US",
  gender,
  quality: (grade[0]! <= "C" ? grade[0] : "D") as Voice["quality"],
  ...(traits ? { traits } : {}),
}));
