import { useMemo } from "react";
import type { Tone } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import { drawerPosition, drawerReducer, type DrawerState } from "./drawer";
import { VoiceDrawer } from "./VoiceDrawer";

interface Props {
  state: DrawerState;
  onChange(s: DrawerState): void;
  /** The filtered list: the drawer steps through it and counts within it. */
  voices: Voice[];
  defaultId: string;
  playing: string | null;
  tone(v: Voice): Tone;
  preview(v: Voice): void;
  makeDefault(id: string): void;
}

const focusCard = (id: string) => document.querySelector<HTMLElement>(`[data-voice="${CSS.escape(id)}"]`)?.focus();

/** The drawer for the open voice (nothing when the filter hides it). Closing puts focus back on the voice's card. */
export function DrawerHost({ state, onChange, voices, defaultId, playing, tone, preview, makeDefault }: Props) {
  const ids = useMemo(() => voices.map((v) => v.id), [voices]);
  const position = drawerPosition(state, ids);
  const v = position === null ? undefined : voices[position - 1];
  if (!v || position === null) return null;
  return (
    <VoiceDrawer
      voice={v}
      tone={tone(v)}
      position={position}
      total={voices.length}
      isDefault={v.id === defaultId}
      playing={playing === v.id}
      onPreview={() => preview(v)}
      onMakeDefault={() => makeDefault(v.id)}
      onPrev={() => onChange(drawerReducer(state, { type: "prev", ids }))}
      onNext={() => onChange(drawerReducer(state, { type: "next", ids }))}
      onClose={() => {
        focusCard(v.id);
        onChange(drawerReducer(state, { type: "close" }));
      }}
    />
  );
}
