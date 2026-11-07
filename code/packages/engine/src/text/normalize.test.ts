import { describe, expect, it } from "vite-plus/test";
import { normalizeText } from "./normalize";

describe("normalizeText (default: leaves digits to the phonemizer)", () => {
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

describe("normalizeText({ numbers: true })", () => {
  it.each([
    ["He was the 1st and 23rd.", "He was the first and twenty-third."],
    ["Growth was 50% and 3.5%.", "Growth was fifty percent and three point five percent."],
    ["In 1999 and 2005 and 1850s.", "In nineteen ninety-nine and two thousand five and eighteen fifties."],
    ["Meet at 3:30pm or 9:00.", "Meet at three thirty p m or nine o'clock."],
    ["It is -5 degrees, 10,000 people.", "It is minus five degrees, ten thousand people."],
    ["Cost $1,250.50.", "Cost one thousand two hundred fifty dollars and fifty cents."],
    ["Room 101.", "Room one hundred one."],
  ])("%s", (input, expected) => expect(normalizeText(input, { numbers: true })).toBe(expected));
});
