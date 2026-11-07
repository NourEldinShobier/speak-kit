/**
 * The source playback rate for a speed; shared by the player and the extension UI.
 * It does not schedule audio.
 */
/** Sources run at playbackRate speed/2 above 2x (the SoundTouch worklet puts the pitch back); never below 1. */
export const playbackRateFor = (speed: number) => Math.max(1, speed / 2);
