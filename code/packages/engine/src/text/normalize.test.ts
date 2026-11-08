import { describe, expect, it } from "vite-plus/test";
import { normalizeText } from "./normalize";

describe("normalizeText (leaves digits to the phonemizer)", () => {
  it.each([
    ["The price is $5M and $2.5 billion.", "The price is 5 million dollars and 2.5 billion dollars."],
    ["It costs €20 or £15.", "It costs 20 euros or 15 pounds."],
    ["I paid $1,250.50 for 3 tickets.", "I paid 1250 dollars and 50 cents for 3 tickets."],
    ["Just $1 and $0.01.", "Just 1 dollar and 0 dollars and 1 cent."],
    ["Visit https://www.example.com/path?a=1 now.", "Visit example dot com now."],
    ["Mail john.doe@example.com today.", "Mail john dot doe at example dot com today."],
    ["Great job 😀 see you 🎉👍🏽", "Great job see you"],
    ["Fruit, e.g. apples, i.e. sweet, vs. veg, approx. 5 km.", "Fruit, for example, apples, that is, sweet, versus veg, approximately 5 kilometers."],
    ["Use 5kg of flour and 1 L of milk at 2.4 GHz.", "Use 5 kilograms of flour and 1 liter of milk at 2.4 gigahertz."],
    ["Growth was 50% on 1st place in 1999.", "Growth was 50% on 1st place in 1999."],
    ["Plain text stays.", "Plain text stays."],
  ])("%s", (input, expected) => expect(normalizeText(input)).toBe(expected));
});
