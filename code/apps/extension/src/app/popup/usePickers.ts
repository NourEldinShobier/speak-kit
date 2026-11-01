import { useEffect, useRef, useState } from "react";

export interface Pickers {
  voiceOpen: boolean;
  speedOpen: boolean;
  openVoice(): void;
  /** closes the voice list and puts focus back on the button that opened it */
  closeVoice(): void;
  toggleSpeed(): void;
}

type Opener = ".pp-voicebtn" | ".pp-speedbtn";

/** The voice list and the speed panel: at most one open, both closed when the popup leaves the player views, Escape closes and restores focus. */
export function usePickers(home: boolean): Pickers {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  useEffect(() => {
    if (!home) {
      setVoiceOpen(false);
      setSpeedOpen(false);
    }
  }, [home]);
  // Closing the voice picker or speed panel puts keyboard focus back on the button that opened it.
  const refocus = useRef<Opener | null>(null);
  useEffect(() => {
    if (!refocus.current || voiceOpen || speedOpen) return;
    document.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  }, [voiceOpen, speedOpen]);
  // On the document, not the screen: opening the picker unmounts the button that had focus, and keys then go to body.
  useEffect(() => {
    if (!voiceOpen && !speedOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      refocus.current = voiceOpen ? ".pp-voicebtn" : ".pp-speedbtn";
      setVoiceOpen(false);
      setSpeedOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [voiceOpen, speedOpen]);
  return {
    voiceOpen,
    speedOpen,
    openVoice: () => {
      setVoiceOpen(true);
      setSpeedOpen(false);
    },
    closeVoice: () => {
      refocus.current = ".pp-voicebtn";
      setVoiceOpen(false);
    },
    toggleSpeed: () => setSpeedOpen((x) => !x),
  };
}
