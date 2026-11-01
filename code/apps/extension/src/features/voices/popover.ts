import { avatar, h, icon, iconButton, popoverSurface } from "@speakkit/ui/vanilla";
import type { VoiceInfo } from "../../shared/internal";

interface VoicePopoverOptions {
  /** resolves with the voices of the app (GET /v1/voices through the service worker) */
  voices(): Promise<VoiceInfo[]>;
  current(): string;
  onPick(v: VoiceInfo): void;
  onPreview(id: string): void;
  /** the popover was removed from the page while the list was loading */
  alive(el: HTMLElement): boolean;
}

/** Voice popover (B16): search and a list of the voices the app offers. Nothing is bundled; the list is empty until the app answers. */
export function voicePopover(o: VoicePopoverOptions): HTMLElement {
  let list: VoiceInfo[] = [];
  let state: "loading" | "ready" | "empty" = "loading";
  const count = h("small", { class: "sk-pop-count" }, "Loading...");
  const input = h("input", { class: "lm-input__field", placeholder: "Search voices", "aria-label": "Search voices", type: "search" });
  const search = h("label", { class: "lm-input lm-input--sm" }, icon("search", 16, "lm-input__icon"), input);
  const rows = h("div", { class: "sk-vlist", role: "list", "aria-label": "Voices" });
  const draw = () => {
    rows.textContent = "";
    const q = input.value.trim().toLowerCase();
    for (const v of list) {
      if (q && !`${v.name} ${v.desc}`.toLowerCase().includes(q)) continue;
      const sel = v.id === o.current();
      const opt = h(
        "button",
        { type: "button", class: "sk-vopt", "aria-current": sel ? "true" : undefined },
        avatar(v.name, 28, sel ? "accent" : "purple"),
        h("div", { class: "sk-vname" }, h("b", null, v.name), h("span", null, `${v.desc} · Quality ${v.quality}`)),
        sel && icon("check", 16, "sk-vcheck"),
      );
      // the option and the preview button are siblings: an option must not contain another control
      const row = h(
        "div",
        { class: `sk-vrow${sel ? " is-selected" : ""}`, role: "listitem", "data-voice": v.id },
        opt,
        iconButton({
          name: "player-play",
          label: `Preview ${v.name}`,
          size: 28,
          data: { sk: "voice-preview" },
          onClick: (e) => {
            e.stopPropagation();
            o.onPreview(v.id);
          },
        }),
      );
      const pick = () => {
        o.onPick(v);
        draw();
      };
      row.addEventListener("click", pick);
      rows.append(row);
    }
    if (!rows.childElementCount)
      rows.append(h("div", { class: "sk-vnone" }, state === "loading" ? "Loading voices from the app..." : state === "empty" ? "Voices appear when SpeakKit is running." : "No voices match."));
  };
  input.addEventListener("input", draw);
  const pop = popoverSurface("Voice", count, search, rows);
  pop.classList.add("sk-pop-voice");
  draw();
  void o
    .voices()
    .then((vs) => {
      state = vs.length ? "ready" : "empty";
      if (vs.length) list = vs;
      count.textContent = vs.length ? `${vs.length} voices` : "";
      if (o.alive(pop)) draw();
    })
    .catch(() => {
      state = "empty";
      count.textContent = "";
      if (o.alive(pop)) draw();
    });
  return pop;
}
