import { describe, expect, it } from "vite-plus/test";
import { PageIndex } from "./search";
import { answerSearches, deleteItems } from "./search-tool";

const index = new PageIndex(`The ferry is orange. ${"sea ".repeat(215)}

Parking costs two coins.`);
const ids = () => {
  let n = 0;
  return () => `sk_${++n}`;
};
const call = (args: string, id = "item_1", call_id = "call_1") => ({ type: "function_call", name: "search_page", id, call_id, arguments: args });

describe("answerSearches", () => {
  it("answers a search call with the passages, asks the model to go on, and lists the items to delete afterwards", () => {
    const r = answerSearches({ response: { output: [call('{"query":"parking"}')] } }, index, ids());
    expect(r).toEqual({
      events: [{ type: "conversation.item.create", item: { id: "sk_1", type: "function_call_output", call_id: "call_1", output: "Parking costs two coins." } }, { type: "response.create" }],
      items: ["sk_1", "item_1"],
    });
    expect(deleteItems(r!.items)).toEqual([
      { type: "conversation.item.delete", item_id: "sk_1" },
      { type: "conversation.item.delete", item_id: "item_1" },
    ]);
  });

  it("tells the model when nothing matches or the arguments are not JSON", () => {
    for (const args of ['{"query":"zebra"}', "not json", "{}"]) {
      const r = answerSearches({ response: { output: [call(args)] } }, index, ids());
      expect(JSON.stringify(r?.events[0])).toContain("could not find that on the page");
    }
  });

  it("answers several calls with one response.create, and ignores other outputs and other tools", () => {
    const out = [call('{"query":"ferry"}', "i1", "c1"), call('{"query":"parking"}', "i2", "c2"), { type: "message" }, { type: "function_call", name: "other", call_id: "c3", id: "i3" }];
    const r = answerSearches({ response: { output: out } }, index, ids());
    expect(r?.events.map((e) => (e as { type: string }).type)).toEqual(["conversation.item.create", "conversation.item.create", "response.create"]);
    expect(r?.items).toEqual(["sk_1", "i1", "sk_2", "i2"]);
  });

  it("does nothing for a response without a search call", () => {
    expect(answerSearches({ response: { output: [{ type: "message" }] } }, index, ids())).toBeUndefined();
    expect(answerSearches({}, index, ids())).toBeUndefined();
  });
});
