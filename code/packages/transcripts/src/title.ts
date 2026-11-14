const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** The title a transcript has until the person renames it: the file name without its extension, or the start time of a recording. */
export function provisionalTitle(o: { source: "file" | "microphone"; name?: string; at: number }): string {
  if (o.source === "file" && o.name) {
    const stem = o.name
      .replace(/\.[^.]{1,5}$/, "")
      .replace(/[_]+/g, " ")
      .trim();
    if (stem) return stem.slice(0, 120);
  }
  const d = new Date(o.at);
  return `Conversation ${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
