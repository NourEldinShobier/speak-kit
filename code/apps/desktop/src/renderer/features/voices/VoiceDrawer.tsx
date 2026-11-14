import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Avatar, Badge, Button, IconButton, StatusPill, type Tone } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import { GRADE_TONE } from "./grade";
import "./drawer.css";
import { genderLabel, langLabel } from "./model";
import "../../../shared/i18n/packs/voices";
import { useT } from "../../i18n";

/** One line per grade. The grades are the Kokoro project's overall ratings (A best, F worst); the engine's list folds F into D. */
export const GRADE_NOTE = { A: "v.grade.A", B: "v.grade.B", C: "v.grade.C", D: "v.grade.D" } as const satisfies Record<Voice["quality"], string>;

interface Props {
  voice: Voice;
  tone: Tone;
  /** 1-based place in the filtered list, and the list's length. */
  position: number;
  total: number;
  isDefault: boolean;
  playing: boolean;
  onPreview(): void;
  onMakeDefault(): void;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
}

type BarProps = Pick<Props, "position" | "total" | "onPrev" | "onNext" | "onClose">;

function DrawerBar({ position, total, onPrev, onNext, onClose }: BarProps) {
  const { t } = useT();
  return (
    <header className="sk-vdrawer__bar">
      <IconButton name="chevron-left" label={t("v.prev")} disabled={position <= 1} onClick={onPrev} />
      <IconButton name="chevron-right" label={t("v.next")} disabled={position >= total} onClick={onNext} />
      <span className="sk-vdrawer__count" aria-live="polite">
        {t("v.count", { position, total })}
      </span>
      <IconButton name="x" label={t("common.close")} onClick={onClose} />
    </header>
  );
}

type BodyProps = Pick<Props, "tone" | "isDefault" | "playing" | "onPreview" | "onMakeDefault"> & { voice: Voice; titleId: string };

function DrawerBody({ voice: v, titleId, tone, isDefault, playing, onPreview, onMakeDefault }: BodyProps) {
  const { t } = useT();
  return (
    <div className="sk-vdrawer__body">
      <div className="sk-vdrawer__who">
        <Avatar name={v.name} tone={tone} size={56} />
        <div>
          <h2 id={titleId} className="sk-vdrawer__name">
            {v.name}
            {isDefault && <Badge>{t("v.default")}</Badge>}
          </h2>
          <p className="sk-vdrawer__meta">
            {langLabel(v)} · {genderLabel(v)}
          </p>
        </div>
      </div>
      <div className="sk-vdrawer__grade">
        <StatusPill tone={GRADE_TONE[v.quality]}>{t("v.gradeLabel", { grade: v.quality })}</StatusPill>
        <p>{t(GRADE_NOTE[v.quality])}</p>
      </div>
      <div className="sk-vdrawer__actions">
        <Button variant="primary" iconLeft={playing ? "player-stop" : "player-play"} aria-label={t(playing ? "v.stopAria" : "v.previewAria", { name: v.name })} onClick={onPreview}>
          {t(playing ? "v.stop" : "v.preview")}
        </Button>
        <Button {...(isDefault ? { iconLeft: "check" as const } : {})} disabled={isDefault} onClick={onMakeDefault}>
          {t(isDefault ? "v.defaultVoice" : "v.makeDefault")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The detail drawer of one voice: a non-modal dialog on the right of the content panel. Escape closes it; the left and right
 * arrow keys move to the previous and next voice while it has focus. It takes focus when it opens.
 */
export function VoiceDrawer({ voice: v, tone, position, total, isDefault, playing, onPreview, onMakeDefault, onPrev, onNext, onClose }: Props) {
  const title = useId();
  const ref = useRef<HTMLElement>(null);
  // On opening, and after a step that disabled the button holding focus (first or last voice), so Escape and the arrows keep working.
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement) || document.activeElement?.hasAttribute("disabled")) ref.current?.focus();
  }, [position]);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowLeft" && position > 1) onPrev();
    else if (e.key === "ArrowRight" && position < total) onNext();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <aside ref={ref} className="sk-vdrawer" role="dialog" aria-labelledby={title} tabIndex={-1} onKeyDown={keys}>
      <DrawerBar position={position} total={total} onPrev={onPrev} onNext={onNext} onClose={onClose} />
      <DrawerBody voice={v} titleId={title} tone={tone} isDefault={isDefault} playing={playing} onPreview={onPreview} onMakeDefault={onMakeDefault} />
    </aside>
  );
}
