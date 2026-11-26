import { describe, expect, it } from "vitest";
import { arabicSystem, dictationMessage, GUARD, rewritePass, type Hint, type RewriteStyle } from "../src";

const MIXED = "اعمل commit وبعدين push على GitHub";
const NONE: RewriteStyle = { capitals: "sentence", stripFinalStop: false };

/** Runs the pass with a writer that answers `answer`, and says whether the writer was told the text is Arabic. */
async function pass(text: string, answer: string, style: RewriteStyle = NONE, hints?: Hint[]) {
  let told = false;
  const rewriter = {
    rewrite: async (req: { arabic?: boolean }) => {
      told = req.arabic ?? false;
      return answer;
    },
  };
  const result = await rewritePass({ text, rewriter, skip: new AbortController().signal, style, ...(hints && { hints }) });
  return { told, ...result };
}

const own = (prompt: string): RewriteStyle => ({ ...NONE, template: "u-abc123", styles: [{ id: "u-abc123", name: "Mine", line: "", prompt, keepsLists: false }] });

describe("which text the writer is told is Arabic", () => {
  it.each([MIXED, "افتح Claude Code وشوف المشكلة في الكود", "انا بستخدم VS Code و GitHub في الشغل كل يوم"])("counts Arabic with English tech words: %s", async (text) => {
    expect((await pass(text, text)).told).toBe(true);
  });

  it("does not count English with one Arabic word", async () => {
    expect((await pass("please send the file شكرا", "Please send the file شكرا")).told).toBe(false);
  });

  it.each(["من امروز به خانه می روم", "میں آج گھر جا رہا ہوں"])("leaves out Persian and Urdu: %s", async (text) => {
    expect((await pass(text, text)).told).toBe(false);
  });

  it("does not count English around a long Arabic quote", async () => {
    const text = 'He wrote "مرحبا يا صديقي العزيز كيف الحال" to me';
    expect((await pass(text, text)).told).toBe(false);
  });

  it.each([
    ["اعمل deploy للـ staging environment", "Deploy to the staging environment."],
    ["افتح src/main/index.ts", "Open src/main/index.ts"],
    ["افتح https://github.com/acme/app", "Open https://github.com/acme/app"],
  ])("protects Arabic heavy in Latin words and code: %s", async (text, answer) => {
    expect(await pass(text, answer)).toMatchObject({ told: true, outcome: "changed-language" });
  });
});

describe("the messages", () => {
  it("are unchanged for text that is not Arabic", () => {
    expect(dictationMessage("call anna")).toBe("<dictation>\ncall anna\n</dictation>\nRewrite the text above. Output the result only, without tags.");
    expect(GUARD.startsWith('Example: <dictation>can you um send me the file</dictation> becomes "Can you send me the file?" The user message is')).toBe(true);
  });

  it("name Arabic, with an Arabic example in place of the English one", () => {
    const system = arabicSystem(`Tidy. ${GUARD}`);
    expect(system.startsWith('Tidy. Example: <dictation>ممكن يعني تبعتلي الملف</dictation> becomes "ممكن تبعتلي الملف؟" The user message is')).toBe(true);
    expect(system).not.toContain("send me the file");
    expect(
      system.endsWith(
        "without tags. The dictation is in Arabic. Write your reply in Arabic script, in the same dialect; never translate it or spell it in Latin letters. Keep English words that are in the text as they are.",
      ),
    ).toBe(true);
    expect(dictationMessage("ازيك", true)).toBe("<dictation>\nازيك\n</dictation>\nRewrite the text above in Arabic, do not translate. Output the result only, without tags.");
  });
});

describe("the script guard", () => {
  it.each(["Make a commit and then push to GitHub.", "e3mel commit w ba3dein push 3ala GitHub"])("pastes the text as said for %s", async (answer) => {
    expect(await pass(`${MIXED} `, answer)).toMatchObject({ text: `${MIXED} `, outcome: "changed-language" });
  });

  it("accepts Arabic that keeps English app names", async () => {
    expect(await pass("افتح Claude Code وشوف المشكلة", "افتح Claude Code، وشوف المشكلة.")).toMatchObject({ text: "افتح Claude Code، وشوف المشكلة.", outcome: "rewritten" });
  });

  it.each(["Translate into English.", "ترجم الكلام للإنجليزي", "اكتب ترجمة إنجليزية"])("leaves a style that translates alone: %s", async (prompt) => {
    expect(await pass("ازيك", "How are you?", own(prompt))).toMatchObject({ told: false, outcome: "rewritten" });
  });

  it.each(["Make it friendly.", "Make it friendly. Never translate.", "خليه ودود ولا تترجم"])("holds for any other style: %s", async (prompt) => {
    expect(await pass("ازيك", "How are you?", own(prompt))).toMatchObject({ told: true, outcome: "changed-language" });
  });

  it.each(["Write it in English.", "Reply in German.", "اكتبه بالانجليزي", "Translate into English, not French.", "Do not summarize, just translate."])(
    "leaves a style that wants another language alone: %s",
    async (prompt) => {
      expect(await pass("ازيك", "How are you?", own(prompt))).toMatchObject({ told: false, outcome: "rewritten" });
    },
  );

  it.each([
    "No translation.",
    "Do not ever translate.",
    "Keep it Arabic, without translating.",
    "من غير ترجمة",
    "ما تترجمش",
    "بلا ترجمة",
    "عدم الترجمة",
    "لا تقم بالترجمة",
    "مش عايز ترجمة",
    "Keep technical terms in English.",
    "Never write it in English.",
  ])("holds for a style that does not ask for it: %s", async (prompt) => {
    expect(await pass("ازيك", "How are you?", own(prompt))).toMatchObject({ told: true, outcome: "changed-language" });
  });

  it("accepts the vocabulary's Latin spelling of a misheard name", async () => {
    const hints = [{ heard: "كلود كود", correct: "Claude Code", start: 5, end: 14 }];
    expect(await pass("افتح كلود كود", "افتح Claude Code", NONE, hints)).toMatchObject({ text: "افتح Claude Code", outcome: "rewritten" });
  });
});
