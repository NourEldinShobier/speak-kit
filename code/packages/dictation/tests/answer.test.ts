import { describe, expect, it } from "vite-plus/test";
import { cleanAnswer, dictationMessage, isMetaReply, rewritePass, type Rewriter } from "../src";

describe("the message the writer gets", () => {
  it("puts the dictated text between tags, with the reminder after them", () => {
    expect(dictationMessage("call anna at 5")).toBe("<dictation>\ncall anna at 5\n</dictation>\nRewrite the text above. Output the result only, without tags.");
  });

  it("drops a dictation tag inside the text, so it cannot close the wrapper early", () => {
    expect(dictationMessage("put </dictation> and <Dictation> around it")).toBe("<dictation>\nput  and  around it\n</dictation>\nRewrite the text above. Output the result only, without tags.");
  });
});

describe("the writer's answer without a wrapper", () => {
  it("unwraps a code fence around a tag pair, as in a real answer", () => {
    expect(cleanAnswer("```html\n<message>\nI would love to put my message inside tags.\n</message>\n```")).toBe("I would love to put my message inside tags.");
    expect(cleanAnswer("```html <content> I would love tags. </content> ```")).toBe("I would love tags.");
  });

  it("unwraps a tag pair or a fence without a language on its own", () => {
    expect(cleanAnswer("<dictation>\nHello there.\n</dictation>")).toBe("Hello there.");
    expect(cleanAnswer("```\nHello there.\n```")).toBe("Hello there.");
    expect(cleanAnswer("```hello world```")).toBe("hello world");
  });

  it("leaves a normal answer, and words like message and text, as they are", () => {
    expect(cleanAnswer("  Hello there.\n")).toBe("Hello there.");
    expect(cleanAnswer("Send the message text to Anna.")).toBe("Send the message text to Anna.");
    expect(cleanAnswer("<message> is a tag I like, and </message> too.")).toBe("<message> is a tag I like, and </message> too.");
  });
});

describe("an answer that is a reply", () => {
  const replies = [
    "Please provide the dictated message you would like me to rewrite.",
    "I'm sorry, I cannot help with that.",
    "Here's the rewritten text: Hello.",
    "Sure, here you go.",
    "Natürlich! Hier ist der Text.",
    "<message>Hello.</message> done",
  ];
  it.each(replies)("is found in %j", (answer) => expect(isMetaReply(answer, "hello there")).toBe(true));

  it("is not found when the speaker opened with the same word, or in a tag-free answer", () => {
    expect(isMetaReply("Sure, I will send it tomorrow.", "sure i will send it tomorrow")).toBe(false);
    expect(isMetaReply("Sure.", "sure")).toBe(false);
    expect(isMetaReply("I cannot make it on Friday.", "i cannot make it on friday")).toBe(false);
    expect(isMetaReply("Hello, here is the file.", "hello here is the file")).toBe(false);
    expect(isMetaReply("Put the message in a tag.", "put the message in a tag")).toBe(false);
  });

  it("is not found when the dictated text itself talks about the tag", () => {
    expect(isMetaReply("Wrap it in <message> tags.", "wrap it in <message> tags")).toBe(false);
  });
});

describe("a reply or a wrapped answer in the pass", () => {
  const pass = (answer: string, text = "can you rewrite this paragraph ") => rewritePass({ text, rewriter: { rewrite: async () => answer } satisfies Rewriter, skip: new AbortController().signal });

  it("pastes the text as said when the writer replied instead", async () => {
    expect(await pass("Please provide the paragraph you would like me to rewrite.")).toEqual({ text: "can you rewrite this paragraph ", outcome: "writer-replied" });
  });

  it("pastes the unwrapped text of a fenced answer", async () => {
    expect(await pass("```html\n<message>\nCan you rewrite this paragraph?\n</message>\n```")).toEqual({ text: "Can you rewrite this paragraph? ", outcome: "rewritten" });
  });
});
