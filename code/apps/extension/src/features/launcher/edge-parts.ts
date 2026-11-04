import type { Settings } from "@speakkit/protocol";
import { avatar, h, iconButton, menu, menuItem } from "@speakkit/ui/vanilla";
import { speedLabel } from "../../shared/format";
import { beside } from "../../shared/placement";
import type { Shell } from "../../shared/ui-types";
import { speedPopover } from "../player";
import { voicePopover } from "../voices";
import type { Surface } from "./types";

/** The "More" menu of the edge pill: Settings and Hide on this site. */
export function moreMenu(shell: Shell, hd: Surface["hd"]): HTMLElement {
  const m = menu(
    menuItem({
      label: "Settings",
      icon: "adjustments",
      onSelect: () => {
        shell.closePopover();
        hd.openOptions();
      },
    }),
    menuItem({
      label: "Hide for this tab",
      icon: "x",
      onSelect: () => {
        shell.closePopover();
        hd.closeTab();
      },
    }),
    menuItem({
      label: "Hide on this site",
      icon: "eye-off",
      onSelect: () => {
        shell.closePopover();
        hd.hideOnSite();
      },
    }),
  );
  m.classList.add("sk-menu");
  m.querySelectorAll<HTMLElement>("button").forEach((b, i) => (b.dataset.sk = ["menu-settings", "menu-hide-tab", "menu-hide-site"][i]!));
  return m;
}

/** The speed pill and voice button of the edge pill, each opening its popover beside the pill. `avatar` is the voice initial, which the caller keeps current. */
export function speedVoiceButtons(s: Surface, l: Settings["launcher"]): { speed: HTMLElement; voice: HTMLElement; avatar: HTMLElement } {
  const { shell, hd } = s;
  const m = s.model();
  const speed = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-speed", "aria-label": `Speed ${speedLabel(m.speed)}`, "data-sk": "launcher-speed" }, speedLabel(m.speed));
  speed.addEventListener("click", () =>
    shell.togglePopover({ kind: "speed", anchor: speed, build: () => speedPopover({ speed: () => s.model().speed, onSet: (v) => hd.setSpeed(v) }), place: beside(l.side) }),
  );
  const voice = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--icon sk-vc", "aria-label": "Voice", "data-sk": "launcher-voice" });
  const av = avatar(m.voiceName, 24, "accent");
  voice.append(av);
  voice.addEventListener("click", () =>
    shell.togglePopover({
      kind: "voice",
      anchor: voice,
      build: () => voicePopover({ voices: () => hd.voices(), current: () => s.model().voice, onPick: (v) => hd.setVoice(v.id), onPreview: (id) => hd.previewVoice(id), alive: (el) => el.isConnected }),
      place: beside(l.side),
    }),
  );
  return { speed, voice, avatar: av };
}

/** Shows and hides a tooltip beside the pill. */
export interface Tip {
  show(anchor: HTMLElement, label: string): void;
  hide(): void;
}

/** The pill's close button: stops the reading in this tab and hides the in-page UI here until reading is asked for again or the page reloads. */
export function closeButton(hd: Surface["hd"], tip: Tip): HTMLElement {
  const b = iconButton({ name: "x", label: "Close for this tab", size: 32, data: { sk: "launcher-close" }, onClick: () => hd.closeTab() });
  for (const ev of ["pointerenter", "focus"]) b.addEventListener(ev, () => tip.show(b, "Close for this tab"));
  for (const ev of ["pointerleave", "blur"]) b.addEventListener(ev, () => tip.hide());
  return b;
}

/** The idle pill's reader view button; `collapse` closes the pill first. */
export function readerButton(hd: Surface["hd"], collapse: () => void): HTMLElement {
  return iconButton({
    name: "book",
    label: "Reader view",
    size: 32,
    data: { sk: "launcher-reader" },
    onClick: () => {
      collapse();
      hd.openReader();
    },
  });
}
