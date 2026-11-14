import { markOf } from "./model";

type Category = "video" | "chat" | "browser" | "unknown" | "manual";

// Original 16 px outline glyphs, one per kind of call app; none of them is an app's logo.
const GLYPHS: Record<Category, string> = {
  video: "M3 4h6.5A1.5 1.5 0 0 1 11 5.5v5A1.5 1.5 0 0 1 9.5 12H3A1.5 1.5 0 0 1 1.5 10.5v-5A1.5 1.5 0 0 1 3 4z M11 7l3.5 -2v6l-3.5 -2",
  chat: "M3 3h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 11H8l-3 2.5V11H3a1.5 1.5 0 0 1 -1.5 -1.5v-5A1.5 1.5 0 0 1 3 3z",
  browser: "M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-9a1 1 0 0 1 1 -1z M1.5 6h13 M5 2.5V6",
  unknown: "M2.5 2.5h11v11h-11z M6.2 6.4a1.9 1.9 0 1 1 2.9 1.6c-.7.4 -1.1.8 -1.1 1.5 M8 11.6v.1",
  manual: "M6 3a2 2 0 0 1 4 0v4a2 2 0 0 1 -4 0z M3.5 7.5a4.5 4.5 0 0 0 9 0 M8 12v2.5",
};

const CATEGORY: Record<string, Category> = { teams: "video", zoom: "video", meet: "browser", slack: "chat", discord: "chat", manual: "manual", unknown: "unknown", "": "unknown" };

/** The glyph of the kind of app a meeting came from (video call, chat app, browser tab, unknown), or the two-letter mark of an app the user added. */
export function ProviderMark({ providerId, name }: { providerId: string; name: string }) {
  const category = CATEGORY[providerId];
  if (!category) return <>{markOf(name)}</>;
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-provider={providerId}
      data-category={category}
      focusable="false"
    >
      <path d={GLYPHS[category]} />
    </svg>
  );
}
