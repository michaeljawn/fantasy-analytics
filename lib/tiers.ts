// Splits a descending list into tiers wherever the drop to the next player is unusually large.
// Players past maxPlayers share one final tier.
export function assignTiers(values: number[], maxPlayers = 60): number[] {
  const n = Math.min(values.length, maxPlayers);
  const gaps = values.slice(1, n).map((v, i) => values[i] - v);
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / (gaps.length || 1));
  const threshold = mean + 0.75 * sd;

  const tiers: number[] = [];
  let tier = 1;
  for (let i = 0; i < values.length; i++) {
    if (i > 0 && i < n && values[i - 1] - values[i] > threshold) tier++;
    if (i === n) tier++;
    tiers.push(tier);
  }
  return tiers;
}
