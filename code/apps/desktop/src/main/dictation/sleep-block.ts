interface Blocker {
  start(kind: "prevent-app-suspension"): number;
  stop(id: number): void;
}

/**
 * Keeps the computer from sleeping while a recording runs. A failure to ask is reported and the recording goes on; releasing twice, or an id the
 * system already dropped, is harmless.
 */
export function createSleepBlock(blocker: Blocker, enabled: () => boolean, warn: (why: string) => void): (recording: boolean) => void {
  let id: number | undefined;
  return (recording) => {
    if (recording && enabled() && id === undefined) {
      try {
        id = blocker.start("prevent-app-suspension");
      } catch (e) {
        warn(String(e));
      }
    } else if (!recording && id !== undefined) {
      const held = id;
      id = undefined;
      try {
        blocker.stop(held);
      } catch (e) {
        warn(String(e));
      }
    }
  };
}
