/** Holds the microphone claim for a screen capture: only while it records with narration on, since without narration no microphone is opened. */
export function createMicClaim(claim: ((name: string) => () => void) | undefined) {
  let release: (() => void) | undefined;
  const drop = () => {
    release?.();
    release = undefined;
  };
  return {
    sync(recording: boolean, narrating: boolean) {
      if (recording && narrating) release ??= claim?.("Screen capture");
      else drop();
    },
    release: drop,
  };
}
