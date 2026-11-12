const KNOWN: Readonly<Record<string, string>> = {
  code: "Visual Studio Code",
  chrome: "Google Chrome",
  msedge: "Microsoft Edge",
  firefox: "Firefox",
  windowsterminal: "Windows Terminal",
  wt: "Windows Terminal",
  winword: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpnt: "Microsoft PowerPoint",
  outlook: "Outlook",
  "ms-teams": "Microsoft Teams",
  explorer: "File Explorer",
  mstsc: "Remote Desktop",
  msrdc: "Remote Desktop",
};

/** A readable name for a program from its file name: a short list of well-known ones, otherwise the file name without ".exe", split into words. */
export function friendlyAppName(exe: string | null | undefined): string | undefined {
  if (!exe) return undefined;
  const stem = exe.replace(/\.exe$/i, "");
  const known = KNOWN[stem.toLowerCase()];
  if (known) return known;
  const words = stem
    .replaceAll(/[-_.]+/g, " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : undefined;
}
