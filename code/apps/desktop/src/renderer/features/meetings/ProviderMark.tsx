import { markOf } from "./model";

// Original outline glyphs, one per call app; they only hint at the app and are not its logo.
const GLYPHS: Record<string, string> = {
  teams: "M5 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-9z M8.5 9h4 M10.5 9v6 M18 9h1a2 2 0 0 1 2 2v3a3 3 0 0 1 -3 3",
  zoom: "M3 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-11z M16 11l5 -3v8l-5 -3",
  meet: "M4 6h12v5h5v7h-17z M16 11v7",
  slack: "M9 4l-2 16 M17 4l-2 16 M4 9h16 M3.5 15h16",
  discord: "M6 6h12a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3z M9 11v2 M15 11v2",
  manual: "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1 -6 0z M6 11a6 6 0 0 0 12 0 M12 17v3",
};

/** The app's glyph in a row, or its two-letter mark for an app that has no glyph. */
export function ProviderMark({ providerId, name }: { providerId: string; name: string }) {
  const d = GLYPHS[providerId];
  if (!d) return <>{markOf(name)}</>;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" data-provider={providerId} focusable="false">
      <path d={d} />
    </svg>
  );
}
