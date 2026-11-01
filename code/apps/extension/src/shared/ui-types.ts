import type { ErrorCode, PlayerStatus, Settings } from "@speakkit/protocol";
import type { VoiceInfo } from "./internal";

/** What the in-page UI shows, computed by the content controller from PlayerState + settings + site rules. */
export interface UiModel {
  status: PlayerStatus;
  elapsedMs: number;
  totalMs: number;
  speed: number;
  voice: string;
  voiceName: string;
  error?: { code?: ErrorCode; message?: string };
  /** reading time of the page at the current speed, shown while idle */
  estimate(): number;
  /** "Paragraph n of N" of the sentence being read (undefined until the document is known) */
  paragraph?: { n: number; of: number };
  /** the block element being read while a reading is active; its gutter button then says "Reading this paragraph" */
  readingBlock?: Element;
  dark: boolean;
  /** the voice engine is unloaded (B22): idle surfaces say it wakes on play */
  engineAsleep: boolean;
  /** settings.show.dock and no hide-controls rule */
  showDock: boolean;
  alwaysDock: boolean;
  /** null: launcher disabled or hidden by site rule */
  launcher: Settings["launcher"] | null;
  /** settings.show.bubble / gutter, already combined with the site rule */
  showBubble: boolean;
  showGutter: boolean;
  /** a reader view is open (the launcher then stays out of the way) */
  readerOpen: boolean;
}

export interface UiHandlers {
  listen(): void;
  readSelection(): void;
  copySelection(): void;
  readFromHere(el: Element): void;
  toggle(): void;
  stop(): void;
  skip(ms: number): void;
  seekFrac(f: number): void;
  nextBlock(): void;
  prevBlock(): void;
  setSpeed(n: number): void;
  setVoice(id: string): void;
  previewVoice(id: string): void;
  voices(): Promise<VoiceInfo[]>;
  retry(): void;
  openApp(): void;
  openOptions(): void;
  openSidepanel(): void;
  replay(): void;
  hideOnSite(): void;
  moveLauncher(y: number): void;
  backToCurrent(): void;
  /** hover / open intent: ask the app to load the model ahead of the click */
  warm(reason: "hover" | "selection" | "dock"): void;
  openReader(): void;
}

export type Placement = (el: HTMLElement, anchor: DOMRect, shell: Shell) => void;

/** The Shadow DOM shell the in-page features draw into (implemented by app/content/shell.ts). */
export interface Shell {
  readonly host: HTMLElement;
  /** the `.lm.sk` container inside the shadow root */
  readonly root: HTMLElement;
  readonly width: number;
  readonly height: number;
  /** the open popover, if any */
  readonly popover: { kind: string; el: HTMLElement; anchor: HTMLElement } | null;
  /** open the popover `kind` under/next to `anchor`, or close it when it is already open for that anchor */
  togglePopover(kind: string, anchor: HTMLElement, build: () => HTMLElement, place: Placement): void;
  closePopover(kind?: string): void;
  /** put the host right after `node` in the page, so it comes next in tab order; null puts it back at the end of the document. Does nothing while focus is inside it. */
  placeHostAfter(node: Node | null): void;
}
