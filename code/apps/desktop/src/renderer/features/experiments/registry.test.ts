import { describe, expect, it } from "vitest";
import { experimentCards, groupedCards, registerExperiment, type ExperimentCard } from "./registry";

const card = (id: string, group: string, extra: Partial<ExperimentCard> = {}): ExperimentCard => ({
  id,
  group,
  title: id,
  description: "d",
  badges: ["New"],
  useState: () => ({ ready: true, on: false, set: async () => undefined }),
  ...extra,
});

describe("experiments registry", () => {
  it("lists registered cards and replaces a card registered again", () => {
    registerExperiment(card("t-a", "T"));
    registerExperiment(card("t-a", "T", { title: "second" }));
    expect(
      experimentCards()
        .filter((c) => c.id === "t-a")
        .map((c) => c.title),
    ).toEqual(["second"]);
  });
  it("groups cards in the order of first appearance and keeps the first lead and note", () => {
    const g = groupedCards([card("1", "Capture", { groupLead: "More ways", groupNote: "Not proven" }), card("2", "Other"), card("3", "Capture", { groupLead: "ignored" })]);
    expect(g.map((x) => [x.group, x.cards.map((c) => c.id), x.lead, x.note])).toEqual([
      ["Capture", ["1", "3"], "More ways", "Not proven"],
      ["Other", ["2"], undefined, undefined],
    ]);
  });
  it("an empty list has no groups", () => {
    expect(groupedCards([])).toEqual([]);
  });
});
