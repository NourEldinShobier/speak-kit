/** Most lines the update card and the What is new page show. */
export const MAX_NOTE_LINES = 8;
const MAX_NOTE_CHARS = 140;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** electron-updater hands over a string or a list of { note }; a release body from the GitHub API is a string. */
function asText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((x) => (x && typeof x === "object" && "note" in x && typeof x.note === "string" ? x.note : typeof x === "string" ? x : "")).join("\n");
  return "";
}

const fromHtml = (s: string) =>
  s
    .replaceAll(/<li\b[^>]*>/gi, "\n* ")
    .replaceAll(/<h\d\b[^>]*>/gi, "\n## ")
    .replaceAll(/<\/?(?:li|p|br|h\d|ul|ol|div)\b[^>]*>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e);

/** The merged-PR style of a generated release: "title by @someone in https://github.com/.../pull/12" keeps only the title. */
const withoutAuthor = (s: string) => s.replace(/\s+by\s+@[\w-]+(?:\[bot\])?\s+in\s+(?:https?:\/\/\S+|#\d+)\s*$/i, "");

const cut = (s: string) => (s.length > MAX_NOTE_CHARS ? `${s.slice(0, MAX_NOTE_CHARS - 1).trimEnd()}…` : s);

/**
 * The lines to show for a release: its bullet points (merged pull request titles in a generated release), without authors, links, the
 * contributors list or the changelog link. A release with no bullets shows its plain lines instead. At most 8 lines.
 */
export function releaseNoteLines(raw: unknown): string[] {
  const text = fromHtml(asText(raw)).replaceAll("\r\n", "\n");
  const bullets: string[] = [];
  const plain: string[] = [];
  let skipping = false;
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) {
      skipping = /new contributors|contributors/i.test(line);
      continue;
    }
    if (skipping || /^\*{0,2}full changelog\*{0,2}\s*:/i.test(line)) continue;
    const bullet = /^[*\-•]\s+(.*)$/.exec(line);
    const body = withoutAuthor((bullet?.[1] ?? line).replaceAll(/\*\*|`/g, "").trim());
    if (!body) continue;
    (bullet ? bullets : plain).push(cut(body));
  }
  return (bullets.length > 0 ? bullets : plain).slice(0, MAX_NOTE_LINES);
}
