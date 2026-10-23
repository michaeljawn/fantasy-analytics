// Combines market value (FantasyCalc) with our model value into one trade value,
// and flags players the two sources disagree on. Pure, so it's easy to test and tune.

export const BLEND_WEIGHTS = { market: 0.6, model: 0.4 };

// A player is flagged when the sources differ by at least this share of the larger value...
export const SIGNAL_GAP = 0.25;
// ...at least one source considers him a real asset...
export const SIGNAL_MIN_VALUE = 10;
// ...and neither source writes him off (a model value of 0 usually means injury or no NFL snaps yet)
export const SIGNAL_FLOOR = 2;

export type Signal = "buy" | "sell" | null;

export type BlendedValue = {
  value: number; // what the trade calculator uses
  model: number | null; // our model, mapped onto the market's value curve
  market: number | null;
  signal: Signal; // "sell" = market pays more than production supports, "buy" = the reverse
  gapPct: number | null; // (market − model) / larger, in %
};

// The market's curve is much flatter than our model's (its 100th player is worth ~17 vs ~5 for us),
// so compare by rank: the model's Nth-best player gets the market's Nth-best value.
export function alignToCurve(modelValues: Map<string, number>, curve: number[]): Map<string, number> {
  const sortedCurve = [...curve].sort((a, b) => b - a);
  const ranked = [...modelValues.entries()].sort((a, b) => b[1] - a[1]);
  const aligned = new Map<string, number>();
  ranked.forEach(([id, v], i) => {
    // Players with no edge over a waiver-level player stay at zero
    aligned.set(id, v <= 0 ? 0 : (sortedCurve[i] ?? sortedCurve[sortedCurve.length - 1] ?? v));
  });
  return aligned;
}

export function blendValue(model: number | null, market: number | null): BlendedValue {
  if (model == null || market == null) {
    return { value: market ?? model ?? 0, model, market, signal: null, gapPct: null };
  }
  const value = Math.round((BLEND_WEIGHTS.market * market + BLEND_WEIGHTS.model * model) * 10) / 10;
  const larger = Math.max(market, model);
  const gap = larger > 0 ? (market - model) / larger : 0;
  const flagged = larger >= SIGNAL_MIN_VALUE && Math.min(market, model) >= SIGNAL_FLOOR && Math.abs(gap) >= SIGNAL_GAP;
  const signal: Signal = !flagged ? null : gap > 0 ? "sell" : "buy";
  return { value, model, market, signal, gapPct: Math.round(gap * 100) };
}

export function blendAll(modelValues: Map<string, number>, marketValues: Map<string, number> | null) {
  const out = new Map<string, BlendedValue>();
  if (!marketValues) {
    for (const [id, v] of modelValues) out.set(id, blendValue(v, null));
    return out;
  }
  const aligned = alignToCurve(modelValues, [...marketValues.values()]);
  for (const id of new Set([...modelValues.keys(), ...marketValues.keys()])) {
    out.set(id, blendValue(aligned.get(id) ?? null, marketValues.get(id) ?? null));
  }
  return out;
}
