import { SettingRow, Segmented, Slider } from "@speakkit/ui";
import { defaultSettings, type SectionProps, type Settings } from "../settings";
import { Card, PageHead, ToggleGrid, ToggleRow } from "../../shared/ui";

type Launcher = Settings["launcher"];
interface RowProps {
  L: Launcher;
  set(p: Partial<Launcher>): void;
}

function SideRow({ L, set }: RowProps) {
  return (
    <SettingRow
      label="Side of the page"
      description="Drag the tab up or down on any page to move it. Saved per site."
      control={
        <Segmented
          label="Side of the page"
          value={L.side}
          onChange={(v) => set({ side: v as "left" | "right" })}
          items={[
            { id: "left", label: "Left" },
            { id: "right", label: "Right" },
          ]}
        />
      }
    />
  );
}

function IdleRow({ L, set }: RowProps) {
  return (
    <SettingRow
      label="When idle"
      description="Peek keeps a thin 14 px tab at the edge; Hidden shows nothing until you move the pointer there."
      control={
        <Segmented
          label="When idle"
          value={L.idle}
          onChange={(v) => set({ idle: v as Launcher["idle"] })}
          items={[
            { id: "peek", label: "Peek" },
            { id: "hidden", label: "Hidden" },
            { id: "open", label: "Always open" },
          ]}
        />
      }
    />
  );
}

function OpenOnRow({ L, set }: RowProps) {
  return (
    <SettingRow
      label="Open on"
      description="Hover opens after 150 ms. Click suits touch screens and trackpads."
      control={
        <Segmented
          label="Open on"
          value={L.openOn}
          onChange={(v) => set({ openOn: v as "hover" | "click" })}
          items={[
            { id: "hover", label: "Hover" },
            { id: "click", label: "Click" },
          ]}
        />
      }
    />
  );
}

function CloseDelayRow({ L, set }: RowProps) {
  const sec = (L.closeDelayMs / 1000).toFixed(1);
  return (
    <SettingRow
      label="Close after the pointer leaves"
      description={`${sec} s. Longer gives more time to reach the buttons.`}
      control={
        <div className="op-slider">
          <div>
            <Slider aria-label="Close delay in seconds" min={0.5} max={5} step={0.1} value={L.closeDelayMs / 1000} onChange={(v) => set({ closeDelayMs: Math.round(v * 1000) })} />
          </div>
          <output>{sec} s</output>
        </div>
      }
    />
  );
}

/** C12 Edge launcher. */
export function LauncherSection({ s, upd, saved }: SectionProps) {
  const L = s.launcher;
  const set = (p: Partial<Launcher>) => upd((x) => ({ ...x, launcher: { ...x.launcher, ...p } }));
  return (
    <>
      <PageHead title="Edge launcher" desc="A small tab at the edge of the page. Hover to open it, then click Play to start reading." saved={saved} onReset={() => set(defaultSettings().launcher)} />
      <Card title="Launcher" id="launcher-h">
        <ToggleRow title="Show the edge launcher" desc="Works on every page, including pages where the dock is hidden." on={L.enabled} onChange={(v) => set({ enabled: v })} />
        <SideRow L={L} set={set} />
        <IdleRow L={L} set={set} />
        <OpenOnRow L={L} set={set} />
        <CloseDelayRow L={L} set={set} />
        <ToggleRow
          title="Keep a wider tab while reading"
          desc="Shows pause and a thin progress line without opening the card."
          on={L.widerWhileReading}
          onChange={(v) => set({ widerWhileReading: v })}
        />
      </Card>
    </>
  );
}

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
            desc: "A tab at the page edge. Hover to open, click Listen.",
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
