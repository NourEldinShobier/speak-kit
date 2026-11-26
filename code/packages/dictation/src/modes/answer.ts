import type { LanguageProfile } from "./languages";

/** The tag around the dictated text in the user message; the guard names it, so the model knows where the text starts and ends. */
const TAG = "dictation";
/** After the closing tag: the last words the model reads are the task, not the speech. */
const REMINDER = "Rewrite the text above. Output the result only, without tags.";

/** The user message of the writer: the dictated text between tags and a reminder, the one of `language` when given. A tag in the text itself is dropped so it cannot close the wrapper early. */
export const dictationMessage = (text: string, language?: LanguageProfile): string => `<${TAG}>\n${text.replace(/<\/?dictation>/gi, "")}\n</${TAG}>\n${language?.reminder ?? REMINDER}`;

const FENCE = /^```(?:[a-z]+(?=\s*(?:\n|<)))?\s*(?<body>[\s\S]*?)\s*```$/i;
const WRAPPER_TAG = /^<(?<tag>dictation|message|content|text|rewrite|rewritten|output|result)>\s*(?<body>[\s\S]*?)\s*<\/\k<tag>>$/i;

/** The writer's answer without a wrapping code fence or a wrapping pair of tags, as small models add them around plain text. */
export function cleanAnswer(raw: string): string {
  const answer = raw.trim();
  const body = (FENCE.exec(answer) ?? WRAPPER_TAG.exec(answer))?.groups?.body;
  return body === undefined ? answer : cleanAnswer(body);
}

const ASSISTANT_START =
  /^(please (provide|share|send|paste)|could you (please )?(provide|share|send)|i'?m sorry|i am sorry|i (cannot|can't|can not|couldn't)|i'?m (unable|not able)|as an ai|sure[,!. ]|certainly|of course|absolutely[,!]|here is|here's|here are|i'?d be happy|i would be happy|i don't see|there is no (text|message|dictation)|bitte (geben|senden|schicken) sie|natürlich[,!]|gerne[,!]|entschuldigung|es tut mir leid)/i;
const LEFT_TAG = /<\/?(?:dictation|message|content|text|rewrite|rewritten)>/i;
const firstWord = (s: string): string | undefined => s.match(/\p{L}+/u)?.[0]?.toLowerCase();

/** Whether the writer answered the person instead of rewriting: it opens like an assistant (the speaker did not open with that word) or leaves a wrapper tag the dictated text did not have. */
export const isMetaReply = (answer: string, text: string): boolean => (ASSISTANT_START.test(answer) && firstWord(answer) !== firstWord(text)) || (LEFT_TAG.test(answer) && !LEFT_TAG.test(text));
