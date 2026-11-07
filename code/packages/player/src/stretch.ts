import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";
import type { CtxLike, StretchDeps, StretchNode } from "./deps";

/**
 * Speeds above 2x: the model speaks at most 2x, the rest is `playbackRate` on the sources. A plain playbackRate change also raises
 * the pitch (+50 percent at 3x); the SoundTouch AudioWorklet is told the rate and puts the pitch back, so the voice keeps its sound.
 * The processor ships as an extension file (assets/soundtouch-processor-*.js) and loads from the extension origin, which the default
 * MV3 content security policy (script-src 'self') allows; nothing is evaluated from strings.
 */
export function soundTouchStretch(url: string = new URL(processorUrl, import.meta.url).href): StretchDeps {
  return {
    register: (ctx: CtxLike) => SoundTouchNode.register(ctx as unknown as BaseAudioContext, url),
    create(ctx: CtxLike): StretchNode {
      const node = new SoundTouchNode({ context: ctx as unknown as BaseAudioContext });
      return {
        input: node,
        connect: (n) => node.connect(n as AudioNode),
        disconnect: () => node.disconnect(),
        setRate: (r) => {
          node.playbackRate.value = r;
          node.pitch.value = 1;
        },
      };
    },
  };
}
