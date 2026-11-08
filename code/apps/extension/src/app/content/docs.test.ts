import { expect, test } from "vite-plus/test";
import { readsHere } from "./docs";

test("the top frame reads its own text first; a sub-frame hands the read to the service worker", () => {
  expect(readsHere(false)).toBe(true);
  expect(readsHere(true)).toBe(false);
});
