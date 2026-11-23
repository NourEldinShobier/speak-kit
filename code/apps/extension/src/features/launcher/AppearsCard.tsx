import type { SectionProps } from "../settings";
import { Card, ToggleGrid } from "../../shared/ui";

/** "Where it appears": which in-page controls exist. */
export function AppearsCard({ s, upd }: Pick<SectionProps, "s" | "upd">) {
  return (
    <Card title="Where it appears" id="appears-h">
      <ToggleGrid
        items={[
          { title: "Selection bubble", desc: "Show Listen when you select text.", on: s.show.bubble, onChange: (v) => upd((x) => ({ ...x, show: { ...x.show, bubble: v } })) },
          { title: "Floating dock", desc: "Compact player at the bottom of the page while reading.", on: s.show.dock, onChange: (v) => upd((x) => ({ ...x, show: { ...x.show, dock: v } })) },
          {
            title: "Edge launcher",
            desc: "A tab at the page edge. Hover to open, click Listen. Drag it up or down to move it.",
            on: s.launcher.enabled,
            onChange: (v) => upd((x) => ({ ...x, launcher: { ...x.launcher, enabled: v } })),
          },
          {
            title: "Paragraph play button",
            desc: "A play button in the margin when you hover a paragraph.",
            on: s.show.gutter,
            onChange: (v) => upd((x) => ({ ...x, show: { ...x.show, gutter: v } })),
          },
          { title: "Auto-scroll while reading", desc: "Keep the current sentence in view.", on: s.show.autoScroll, onChange: (v) => upd((x) => ({ ...x, show: { ...x.show, autoScroll: v } })) },
          {
            title: "Right-click menu entries",
            desc: "Read selection, read from here, add to queue.",
            on: s.show.contextMenu,
            onChange: (v) => upd((x) => ({ ...x, show: { ...x.show, contextMenu: v } })),
          },
        ]}
      />
    </Card>
  );
}
