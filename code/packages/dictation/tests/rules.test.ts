import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { applyRules, type RulesOptions } from "../src/rules";

const off: RulesOptions = { fillers: false, spokenSymbols: false, spokenFormatting: false, autoCapitalize: false, trailingSpace: false, replacements: [], language: "en" };
const run = (text: string, opts: Partial<RulesOptions> = {}): string => applyRules(text, { ...off, ...opts });
const table = (opts: Partial<RulesOptions>, rows: [string, string][]): void => {
  for (const [input, expected] of rows) it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => expect(run(input, opts)).toBe(expected));
};

describe("fillers", () => {
  table({ fillers: true }, [
    ["I um think so", "I think so"],
    ["Um, I think so", "I think so"],
    ["Um, the plan works", "The plan works"],
    ["It ended. Um, the plan works", "It ended. The plan works"],
    ["So, um, I think so", "So, I think so"],
    ["I think, um, that works", "I think, that works"],
    ["I think uh.", "I think."],
    ["This is, uh.", "This is."],
    ["This is, uh", "This is"],
    ["Well uh... okay", "Well okay"],
    ["umm uhh erm er ah", ""],
    ["Er, hello", "Hello"],
    ["line one um\nline two uh", "line one\nline two"],
    ["um, uh, yes", "yes"],
    ["Hmm okay", "Hmm okay"],
    ["Um,   hello", "Hello"],
    ["This is, uh !", "This is !"],
    ["uh,  hello", "hello"],
    ["line one\nuh, line two", "line one\nline two"],
    ["Er hello", "Hello"],
  ]);
  // Text without a filler is not touched, not even its trailing commas or indentation.
  table({ fillers: true }, [
    ["one,\n  two,", "one,\n  two,"],
    ["wait, . no", "wait, . no"],
  ]);
  table({ fillers: true }, [
    ["umbrella", "umbrella"],
    ["ahead of the error", "ahead of the error"],
    ["Uhura said hi", "Uhura said hi"],
    ["uh-huh", "uh-huh"],
    ["ER visit", "ER visit"],
    ["UM", "UM"],
    ["don't um-hm", "don't um-hm"],
    ["well-um", "well-um"],
    ["the_um_file", "the_um_file"],
    ["ähm", "ähm"],
  ]);

  it("leaves a German sentence alone, because er and um are real German words", () => {
    expect(run("Er sagt um drei", { fillers: true, language: "de" })).toBe("Er sagt um drei");
  });

  it("applies to English text found by language detection", () => {
    expect(run("um hello", { fillers: true, language: "en-US" })).toBe("hello");
  });

  it("treats an unknown language as English", () => {
    expect(run("um hello", { fillers: true, language: "auto" })).toBe("hello");
  });

  it("does nothing when switched off", () => {
    expect(run("um hello", { fillers: false })).toBe("um hello");
  });
});

describe("spoken symbols", () => {
  table({ spokenSymbols: true }, [
    ["hashtag python", "#python"],
    ["see hash sign python", "see #python"],
    ["john at sign example", "john@example"],
    ["my underscore file", "my_file"],
    ["well hyphen known", "well-known"],
    ["and slash or", "and/or"],
    ["go forward slash home", "go/home"],
    ["c backslash users", "c\\users"],
    ["hello comma world", "hello, world"],
    ["one semicolon two", "one; two"],
    ["note colon this", "note: this"],
    ["Hello COMMA world", "Hello, world"],
    ["a  comma  b", "a, b"],
    ["commander", "commander"],
    ["a recomma b", "a recomma b"],
    ["slashing", "slashing"],
    ["hashtags", "hashtags"],
    ["hello comma", "hello,"],
    ["type slash. then", "type/. then"],
    ["x  slash  y", "x/y"],
    ["x\tslash\ty", "x/y"],
  ]);
  table({ spokenSymbols: true, language: "de" }, [
    ["hallo komma welt", "hallo, welt"],
    ["a schrägstrich b", "a/b"],
    ["a schragstrich b", "a/b"],
    ["a SCHRÄGSTRICH b", "a/b"],
    ["a bindestrich b", "a-b"],
    ["a unterstrich b", "a_b"],
    ["raute eins", "#eins"],
    ["x klammeraffe y", "x@y"],
    ["x at-zeichen y", "x@y"],
    ["eins semikolon zwei", "eins; zwei"],
    ["hinweis doppelpunkt text", "hinweis: text"],
  ]);

  it("leaves languages without a table alone", () => {
    expect(run("مرحبا comma", { spokenSymbols: true, language: "ar" })).toBe("مرحبا comma");
  });

  it("does nothing when switched off", () => {
    expect(run("hello comma world", { spokenSymbols: false })).toBe("hello comma world");
  });
});

describe("spoken formatting", () => {
  table({ spokenFormatting: true }, [
    ["Hello new paragraph next", "Hello\n\nnext"],
    ["Hello. New paragraph. Next", "Hello.\n\nNext"],
    ["Hello new line next", "Hello\nnext"],
    ["Hello, line break, next", "Hello,\nnext"],
    ["He said open quote hi close quote", 'He said "hi"'],
    ["He said quote hello there unquote now", 'He said "hello there" now'],
    ["the quote of the day", "the quote of the day"],
    ["newline", "newline"],
    ["a new lines b", "a new lines b"],
    ["Hello NEW   PARAGRAPH next", "Hello\n\nnext"],
    ["new line", ""],
    ["new paragraph", ""],
    ["Hello new line", "Hello\n"],
    ["quote one two unquote", '"one two"'],
    ["QUOTE   one   UNQUOTE", '"one"'],
    ["quote one\ntwo unquote", "quote one\ntwo unquote"],
    ["unquoted quote", "unquoted quote"],
  ]);
  table({ spokenFormatting: true, language: "de" }, [
    ["Hallo neue Zeile Welt", "Hallo\nWelt"],
    ["Hallo neuer Absatz Welt", "Hallo\n\nWelt"],
    ["Hallo Zeilenumbruch Welt", "Hallo\nWelt"],
  ]);

  it("does nothing when switched off", () => {
    expect(run("a new line b", { spokenFormatting: false })).toBe("a new line b");
  });
});

// A plain re-statement of the selection rule: every non-overlapping match of each rule is a candidate, the longest wins, ties go to the earlier start and then the earlier rule, losers that overlap a winner are dropped.
function referenceReplace(text: string, rules: { from: string; to: string }[]): string {
  const isLetter = (c: string | undefined): boolean => c !== undefined && /[a-z]/i.test(c);
  const pool: { start: number; end: number; to: string; order: number }[] = [];
  rules.forEach((rule, order) => {
    const n = rule.from.length;
    for (let i = 0; i + n <= text.length; i++) {
      if (text.slice(i, i + n).toLowerCase() === rule.from && !isLetter(text[i - 1]) && !isLetter(text[i + n])) {
        pool.push({ start: i, end: i + n, to: rule.to, order });
        i += n - 1;
      }
    }
  });
  const chosen: typeof pool = [];
  while (pool.length > 0) {
    let best = 0;
    pool.forEach((h, i) => {
      const b = pool[best]!;
      const better = h.end - h.start > b.end - b.start || (h.end - h.start === b.end - b.start && (h.start < b.start || (h.start === b.start && h.order < b.order)));
      if (better) best = i;
    });
    const win = pool[best]!;
    chosen.push(win);
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i]!.start < win.end && win.start < pool[i]!.end) pool.splice(i, 1);
  }
  chosen.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const h of chosen) {
    out += text.slice(at, h.start) + h.to;
    at = h.end;
  }
  return out + text.slice(at);
}

describe("replacements", () => {
  const rule = (from: string, to: string) => ({ from, to });
  it("replaces whole phrases ignoring case", () => {
    expect(run("Speak kit is great, speak KIT", { replacements: [rule("speak kit", "SpeakKit")] })).toBe("SpeakKit is great, SpeakKit");
  });

  it("does not match inside a longer word", () => {
    expect(run("cat concatenate cats", { replacements: [rule("cat", "dog")] })).toBe("dog concatenate cats");
  });

  it("matches phrases that end in a symbol", () => {
    expect(run("I like c++ a lot, c+++", { replacements: [rule("c++", "C plus plus")] })).toBe("I like C plus plus a lot, C plus plus+");
  });

  it("matches Unicode letters", () => {
    expect(run("Straße und STRAßE", { replacements: [rule("straße", "Weg")] })).toBe("Weg und Weg");
  });

  it("the longest match wins, then the earlier rule", () => {
    expect(run("new york city", { replacements: [rule("new york", "NY"), rule("new york city", "NYC")] })).toBe("NYC");
    expect(run("alpha", { replacements: [rule("alpha", "first"), rule("alpha", "second")] })).toBe("first");
  });

  it("overlapping matches that lose are dropped", () => {
    expect(run("a b c", { replacements: [rule("a b", "X"), rule("b c", "Y")] })).toBe("X c");
  });

  it("does not replace the output of another replacement", () => {
    expect(run("one", { replacements: [rule("one", "two"), rule("two", "three")] })).toBe("two");
  });

  it("an empty replacement deletes the phrase and closes the gap", () => {
    const del = { replacements: [rule("basically", "")] };
    expect(run("this is basically fine", del)).toBe("this is fine");
    expect(run("this is fine basically", del)).toBe("this is fine");
    expect(run("this is basically.", del)).toBe("this is.");
    expect(run("this, basically, works", del)).toBe("this, works");
    expect(run("Basically, it works", del)).toBe("It works");
    expect(run("Done. Basically it works", del)).toBe("Done. It works");
    expect(run("one basically\ntwo", del)).toBe("one\ntwo");
    expect(run("one\nbasically two", { ...del, autoCapitalize: false })).toBe("one\nTwo");
  });

  it("does not match at the start of a longer word either", () => {
    expect(run("bobcat cat", { replacements: [rule("cat", "dog")] })).toBe("bobcat dog");
    expect(run("a13d b 3d", { replacements: [rule("3d", "three d")] })).toBe("a13d b three d");
  });

  it("adjacent matches next to each other both apply", () => {
    expect(run("a+-b", { replacements: [rule("+", "P"), rule("-", "M")] })).toBe("aPMb");
  });

  it("a blank phrase does not match runs of spaces", () => {
    expect(run("a  b", { replacements: [rule("  ", "X")] })).toBe("a  b");
  });

  it("deleting closes the gap around tabs, double spaces and sentence ends", () => {
    const del = { replacements: [rule("basically", "")], autoCapitalize: false };
    expect(run("this is basically\tfine", del)).toBe("this is fine");
    expect(run("one  basically\ntwo", del)).toBe("one\ntwo");
    expect(run("yes, basically.", del)).toBe("yes.");
    expect(run("a basically, b", del)).toBe("a, b");
    expect(run("Done. Basically, it works", del)).toBe("Done. It works");
    expect(run("Done.  Basically it works", del)).toBe("Done.  It works");
    expect(run("one\n  basically two", del)).toBe("one\n  Two");
    expect(run("Done. Basically 1st place", del)).toBe("Done. 1st place");
  });

  it("a deletion keeps its capital for the next text even when two deletions meet", () => {
    const del = { replacements: [rule("basically", ""), rule("really", "")] };
    expect(run("Done. Basically really it works", del)).toBe("Done. It works");
  });

  it("the capital from a deletion is used once", () => {
    expect(run("Basically hello x", { replacements: [rule("basically", ""), rule("x", "y")] })).toBe("Hello y");
  });

  it("matches the reference selection for any text and rules", () => {
    const rulesArb = fc.array(fc.record({ from: fc.constantFrom("a", "b", "ab", "ba", "a b", "b a", "aba", "bab", "aa"), to: fc.constantFrom("X", "Y", "Z") }), { minLength: 1, maxLength: 5 });
    fc.assert(
      fc.property(fc.stringMatching(/^[aAbB ]{0,14}$/), rulesArb, (text, rules) => {
        expect(run(text, { replacements: rules })).toBe(referenceReplace(text.trim(), rules));
      }),
      { numRuns: 500 },
    );
  });

  it("ignores rules with an empty phrase", () => {
    expect(run("hello", { replacements: [rule("", "x"), rule("  ", "y")] })).toBe("hello");
  });

  it("runs before the filler rule, so a replacement can use a filler word", () => {
    expect(run("um hello", { fillers: true, replacements: [rule("um hello", "greetings")] })).toBe("greetings");
  });
});

describe("capitalisation and spacing", () => {
  table({ autoCapitalize: true }, [
    ["hello world", "Hello world"],
    ["hello. world! how? fine", "Hello. World! How? Fine"],
    ["line one\nline two", "Line one\nLine two"],
    ["line one\n  indented", "Line one\n  Indented"],
    ['"hello there"', '"Hello there"'],
    ["(hello there) friend", "(Hello there) friend"],
    ["e.g. this one", "E.g. this one"],
    ["use e.g. this one", "Use e.g. this one"],
    ["ask dr. smith now", "Ask dr. smith now"],
    ["mr. jones and mrs. jones", "Mr. jones and mrs. jones"],
    ["3 apples. 4 pears", "3 apples. 4 pears"],
    ["#python rocks", "#python rocks"],
    ["already Fine. also fine", "Already Fine. Also fine"],
    ["مرحبا. بكم", "مرحبا. بكم"],
    ["is it a! then", "Is it a! Then"],
    ["one.  two", "One.  Two"],
    ["one.\ttwo", "One.\tTwo"],
    ["one\n\ttwo", "One\n\tTwo"],
  ]);

  it("adds one trailing space when asked, never two, and none after a line break", () => {
    expect(run("hello", { trailingSpace: true })).toBe("hello ");
    expect(run("hello ", { trailingSpace: true })).toBe("hello ");
    expect(run("hello new line", { trailingSpace: true, spokenFormatting: true })).toBe("hello\n");
    expect(run("hello", { trailingSpace: false })).toBe("hello");
  });

  it("trims what the engine pads with", () => {
    expect(run("  hello \n", {})).toBe("hello");
  });

  it("returns nothing for blank text and never a lone trailing space", () => {
    expect(run("", { trailingSpace: true })).toBe("");
    expect(run("   \n ", { trailingSpace: true })).toBe("");
    expect(run("um", { fillers: true, trailingSpace: true })).toBe("");
  });

  it("returns nothing for the tags a model prints on silence", () => {
    for (const tag of ["[BLANK_AUDIO]", "[Music]", "(silence)", "*coughs*", " [ Silence ] "]) expect(run(tag, { trailingSpace: true })).toBe("");
  });

  it("keeps real text that merely contains brackets", () => {
    expect(run("see [1] for more", {})).toBe("see [1] for more");
    expect(run("[1] for more", {})).toBe("[1] for more");
    expect(run("(a) and (b)", {})).toBe("(a) and (b)");
  });

  it("keeps a bracketed tag that is too long to be one", () => {
    const long = `[${"x".repeat(41)}]`;
    expect(run(long, {})).toBe(long);
  });
});

describe("all rules together", () => {
  const all: Partial<RulesOptions> = { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true, replacements: [{ from: "speak kit", to: "SpeakKit" }] };

  it("turns a spoken sentence into text", () => {
    expect(run("um so tell speak kit hashtag launch comma okay new paragraph thanks", all)).toBe("So tell SpeakKit #launch, okay\n\nThanks ");
  });

  it("handles German with the German tables and no English fillers", () => {
    expect(run("Er sagt hallo komma welt neue Zeile ende", { ...all, language: "de" })).toBe("Er sagt hallo, welt\nEnde ");
  });
});

describe("properties", () => {
  const words = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
    "juliet",
    "kilo",
    "lima",
    "mike",
    "november",
    "oscar",
    "papa",
    "quebec",
    "romeo",
    "sierra",
    "tango",
    "victor",
    "whiskey",
    "yankee",
    "zulu",
  ];
  const fillers = ["um", "Um", "uh", "umm", "uhh", "erm", "er", "Er", "ah", "Ah"];
  const sentence = fc.array(fc.tuple(fc.constantFrom(...words), fc.array(fc.constantFrom(...fillers), { maxLength: 2 }), fc.constantFrom("", ",", ".")), { minLength: 1, maxLength: 12 });
  const render = (parts: [string, string[], string][], withFillers: boolean): string => parts.map(([w, f, p]) => [...(withFillers ? f : []), w + p].join(" ")).join(" ");
  const onlyWords = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];

  it("never loses a word that is not a filler", () => {
    fc.assert(
      fc.property(sentence, (parts) => {
        const heard = render(parts, true);
        const out = run(heard, { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true });
        expect(onlyWords(out)).toEqual(onlyWords(render(parts, false)));
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(sentence, (parts) => {
        const opts = { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true };
        const once = run(render(parts, true), opts);
        expect(run(once, opts)).toBe(once);
      }),
    );
  });

  it("leaves text without any trigger as it was, apart from the first capital and the trailing space", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...words), { minLength: 1, maxLength: 10 }), (list) => {
        const text = list.join(" ");
        expect(run(text, { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true })).toBe(`${text[0]?.toUpperCase()}${text.slice(1)} `);
      }),
    );
  });

  it("never throws and never returns padding on any text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (text) => {
        const out = run(text, { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: false, replacements: [{ from: "a", to: "" }] });
        expect(out === out.trimEnd() || out.endsWith("\n") || out === "").toBe(true);
        expect(out.length).toBeLessThanOrEqual(text.length + 20);
      }),
    );
  });
});
