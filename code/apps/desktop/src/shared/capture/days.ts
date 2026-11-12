const DAY = 86_400_000;

/** "Today", "Yesterday" or a date, in the person's time zone. */
export function dayLabel(at: number, now: number, locale = "en-US"): string {
  const start = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();
  const diff = Math.round((start(now) - start(at)) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(at).toLocaleDateString(locale, { month: "short", day: "numeric", ...(new Date(at).getFullYear() !== new Date(now).getFullYear() && { year: "numeric" }) });
}

export function groupByDay<T extends { at: number }>(items: readonly T[], now: number, locale?: string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const r of items) {
    const label = dayLabel(r.at, now, locale);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }
  return groups;
}
