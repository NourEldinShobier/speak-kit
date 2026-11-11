import type { PageIndex } from "./search";

export const SEARCH_TOOL = {
  type: "function",
  name: "search_page",
  description:
    "Looks up the page text. The page is too long to include, so call this with a few keywords from the user's question, in the language of the page, before answering about its details. It returns the best matching passages.",
  parameters: { type: "object", properties: { query: { type: "string", description: "keywords to look for" } }, required: ["query"] },
} as const;

interface Output {
  type?: string;
  name?: string;
  id?: string;
  call_id?: string;
  arguments?: string;
}
/** A response.done: the function calls are in `response.output`. */
export interface ToolEvent {
  response?: { output?: Output[] };
}

const NOT_FOUND = "No passage of the page matches. Tell the user you could not find that on the page.";

/**
 * The events that answer the search calls of a response.done: one function_call_output per call, then a response.create so the model goes on.
 * `items` are the ids of the calls and their outputs; the caller deletes them once the answer is done, so the passages are not billed on every later turn.
 */
export function answerSearches(e: ToolEvent, index: PageIndex | undefined, newId: () => string): { events: object[]; items: string[] } | undefined {
  const calls = (e.response?.output ?? []).filter((o) => o.type === "function_call" && o.name === SEARCH_TOOL.name && o.call_id);
  if (!calls.length) return undefined;
  const events: object[] = [];
  const items: string[] = [];
  for (const c of calls) {
    let query = "";
    try {
      query = String((JSON.parse(c.arguments ?? "{}") as { query?: unknown }).query ?? "");
    } catch {
      /* malformed arguments: the search finds nothing */
    }
    const found = index?.search(query) ?? [];
    const id = newId();
    events.push({ type: "conversation.item.create", item: { id, type: "function_call_output", call_id: c.call_id, output: found.length ? found.join("\n\n---\n\n") : NOT_FOUND } });
    items.push(id, ...(c.id ? [c.id] : []));
  }
  events.push({ type: "response.create" });
  return { events, items };
}

export const deleteItems = (items: string[]) => items.map((item_id) => ({ type: "conversation.item.delete", item_id }));
