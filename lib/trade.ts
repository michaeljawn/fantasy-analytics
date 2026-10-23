// Trade evaluation (pure — safe to import from client components)

// Each extra player in a package is worth less: you only have so many lineup spots
const PACKAGE_WEIGHTS = [1, 0.8, 0.65, 0.5, 0.4, 0.3];

export function packageValue(values: number[]): number {
  return [...values]
    .sort((a, b) => b - a)
    .reduce((sum, v, i) => sum + v * (PACKAGE_WEIGHTS[i] ?? 0.25), 0);
}

export type TradeVerdict = {
  sideA: number;
  sideB: number;
  diffPct: number; // positive = side A receives more value
  label: "Fair" | "Slight edge" | "Lopsided";
  favored: "A" | "B" | null;
};

export function evaluateTrade(a: number[], b: number[]): TradeVerdict {
  const sideA = packageValue(a);
  const sideB = packageValue(b);
  const top = Math.max(sideA, sideB);
  const diffPct = top === 0 ? 0 : ((sideA - sideB) / top) * 100;
  const abs = Math.abs(diffPct);
  return {
    sideA,
    sideB,
    diffPct,
    label: abs < 7 ? "Fair" : abs < 18 ? "Slight edge" : "Lopsided",
    favored: abs < 7 ? null : diffPct > 0 ? "A" : "B",
  };
}
