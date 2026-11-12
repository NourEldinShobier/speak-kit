import type { OpenWindow, Provider } from "./types";

const MEET_CODE = String.raw`[a-z]{3}-[a-z]{4}-[a-z]{3}`;

export const BROWSERS: readonly string[] = ["chrome", "msedge", "brave", "arc", "firefox", "opera", "vivaldi", "chromium", "safari", "google chrome", "microsoft edge", "brave browser", "opera gx"];

/** The call apps Speak Kit knows from the start. Data, so a new app is one more row. */
export const BUILT_IN_PROVIDERS: readonly Provider[] = [
  {
    id: "teams",
    name: "Microsoft Teams",
    mark: "Tm",
    exes: ["ms-teams", "teams", "msteams", "microsoft teams"],
    titles: [String.raw`\|\s*microsoft teams`, String.raw`^microsoft teams`],
    inBrowser: true,
  },
  { id: "zoom", name: "Zoom", mark: "Zm", exes: ["zoom", "zoom.us"], titles: [String.raw`^zoom meeting`, String.raw`^zoom workplace`, String.raw`^zoom$`], inBrowser: true },
  {
    id: "meet",
    name: "Google Meet",
    mark: "Gm",
    exes: [],
    inBrowser: true,
    // "Meet - abc-defg-hij": the code, not the word "meet", marks a call.
    titles: [String.raw`^meet\s[-–]\s${MEET_CODE}`, String.raw`${MEET_CODE}\s[-–]\s`],
    links: [{ host: "meet.google.com", path: String.raw`^/${MEET_CODE}$` }],
  },
  { id: "slack", name: "Slack huddles", mark: "Sl", exes: ["slack"], titles: [String.raw`huddle`], inBrowser: true },
  { id: "discord", name: "Discord", mark: "Dc", exes: ["discord"], titles: [String.raw`voice connected`, String.raw`\bvoice\b.*\bdiscord\b`], inBrowser: true },
];

/** The reasons a meeting link is refused. */
export type LinkProblem = "empty" | "not-a-link" | "too-short";

export type Link = { ok: true; host: string; path: string } | { ok: false; problem: LinkProblem };

/**
 * A meeting link as the person pastes it. Only a full link counts: a host alone, or a host with a path too short to name one meeting
 * ("meet.example.com/a"), would match unrelated pages, so it is refused.
 */
export function parseLink(input: string): Link {
  const text = input.trim();
  if (!text) return { ok: false, problem: "empty" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, problem: "not-a-link" };
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return { ok: false, problem: "not-a-link" };
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length || parts.join("/").length < 6) return { ok: false, problem: "too-short" };
  return { ok: true, host: url.hostname.toLowerCase(), path: url.pathname.replace(/\/+$/, "") };
}

export const LINK_MESSAGES: Record<LinkProblem, string> = {
  empty: "Paste the full meeting link.",
  "not-a-link": "This is not a web link.",
  "too-short": "This link is too short to name one meeting. Paste the full link, with the meeting code.",
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface NewApp {
  name: string;
  exe?: string;
  link?: string;
}

export type UserProvider = { ok: true; provider: Provider } | { ok: false; field: "name" | "app" | "link"; message: string };

/** A provider for an app the person added: by process name, by a full meeting link, or both. */
export function userProvider(a: NewApp, taken: readonly Provider[]): UserProvider {
  const name = a.name.trim();
  if (!name) return { ok: false, field: "name", message: "Give the app a name." };
  const exe = (a.exe?.trim().toLowerCase() ?? "").replace(/\.exe$/, "");
  const linkText = a.link?.trim() ?? "";
  if (!exe && !linkText) return { ok: false, field: "app", message: "Choose the app or paste its meeting link." };
  const base: Provider = { id: `user-${slug(name) || "app"}`, name, mark: name.slice(0, 2).replace(/^./, (c) => c.toUpperCase()), exes: exe ? [exe] : [], userAdded: true };
  if (linkText) {
    const link = parseLink(linkText);
    if (!link.ok) return { ok: false, field: "link", message: LINK_MESSAGES[link.problem] };
    base.inBrowser = true;
    base.links = [{ host: link.host, path: `^${escapeRe(link.path)}$` }];
    // The window title of a tab is the page title, which the link cannot predict: a link-only app is matched by the person's own title words.
    base.titles = [escapeRe(name)];
  }
  let id = base.id;
  for (let n = 2; taken.some((p) => p.id === id); n++) id = `${base.id}-${n}`;
  return { ok: true, provider: { ...base, id } };
}

const isBrowser = (exe: string) => BROWSERS.includes(exe);
const titleHit = (p: Provider, title: string) => (p.titles ?? []).some((t) => new RegExp(t, "i").test(title));

/**
 * Whether this window belongs to the provider's call. Browsers and installed web apps (a PWA runs as its own process, often with the browser's name)
 * count for apps that live in a tab, and only when the title carries the app's own call marker.
 */
export function windowMatches(p: Provider, w: OpenWindow): boolean {
  if (p.exes.includes(w.exe)) return true;
  return !!p.inBrowser && isBrowser(w.exe) && titleHit(p, w.title);
}

/** Whether the process name alone places a microphone user with a provider (a native app); a browser mic user needs a window. */
export const exeMatches = (p: Provider, exe: string) => p.exes.includes(exe);

/** The merged list: built-in apps, then the ones the person added (an added app never replaces a built-in id). */
export function allProviders(added: readonly Provider[]): Provider[] {
  const ids = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));
  return [...BUILT_IN_PROVIDERS, ...added.filter((p) => !ids.has(p.id))];
}
