export interface GainLike {
  gain: { value: number };
  connect(to: unknown): void;
}
interface ContextLike {
  destination: unknown;
  createGain(): GainLike;
}

/** Puts a gain node between the player's sources and the speakers: the context's `destination` now is the gain node, which feeds the real one. */
export function routeThroughGain(ctx: ContextLike, volume: number): GainLike {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);
  Object.defineProperty(ctx, "destination", { value: gain });
  return gain;
}
