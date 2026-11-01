import type { Settings } from "@speakkit/protocol";
import { avatar, h, menu, menuItem } from "@speakkit/ui/vanilla";
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
      label: "Hide on this site",
      icon: "eye-off",
      onSelect: () => {
        shell.closePopover();
        hd.hideOnSite();
      },
    }),
  );
  m.classList.add("sk-menu");
  m.querySelectorAll<HTMLElement>("button").forEach((b, i) => (b.dataset.sk = ["menu-settings", "menu-hide-site"][i]!));
  return m;
}

/** The speed pill and voice button of the edge pill, each opening its popover beside the pill. `avatar` is the voice initial, which the caller keeps current. */
export function speedVoiceButtons(s: Surface, l: Settings["launcher"]): { speed: HTMLElement; voice: HTMLElement; avatar: HTMLElement } {
  const { shell, hd } = s;
  const m = s.model();
  const speed = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--sm sk-speed", "aria-label": `Speed ${speedLabel(m.speed)}`, "data-sk": "launcher-speed" }, speedLabel(m.speed));
  speed.addEventListener("click", () => shell.togglePopover("speed", speed, () => speedPopover({ speed: () => s.model().speed, onSet: (v) => hd.setSpeed(v) }), beside(l.side)));
  const voice = h("button", { type: "button", class: "lm-btn lm-btn--secondary lm-btn--icon sk-vc", "aria-label": "Voice", "data-sk": "launcher-voice" });
  const av = avatar(m.voiceName, 24, "accent");
  voice.append(av);
  voice.addEventListener("click", () =>
    shell.togglePopover(
      "voice",
      voice,
      () => voicePopover({ voices: () => hd.voices(), current: () => s.model().voice, onPick: (v) => hd.setVoice(v.id), onPreview: (id) => hd.previewVoice(id), alive: (el) => el.isConnected }),
      beside(l.side),
    ),
  );
  return { speed, voice, avatar: av };
}
