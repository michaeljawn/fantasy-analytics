// Start/sit score for a single week. Pure, so the logic is easy to test and explain.

export type StartSitInput = {
  projNext: number | null;
  seasonAvg: number | null;
  last3Avg: number | null;
  prevAvg: number | null;
  floor: number | null;
  ceiling: number | null;
  injuryStatus: string | null;
  nextOpponent: string | null;
  matchupFactor: number | null; // points allowed vs league average (1 = average)
};

export type StartSitScore = {
  score: number;
  form: number | null;
  matchupAdj: number;
  floor: number | null;
  ceiling: number | null;
  status: "ok" | "out" | "bye";
};

const RULED_OUT = new Set(["Out", "IR", "PUP", "Sus"]);

export function scoreStartSit(p: StartSitInput): StartSitScore {
  // Shrink the matchup factor halfway toward neutral; defensive samples are noisy
  const matchupAdj = p.matchupFactor == null ? 1 : 1 + 0.5 * (p.matchupFactor - 1);

  const form =
    p.seasonAvg != null && p.last3Avg != null
      ? 0.5 * p.seasonAvg + 0.5 * p.last3Avg
      : (p.seasonAvg ?? p.prevAvg ?? null);

  const status = RULED_OUT.has(p.injuryStatus ?? "") ? "out" : p.projNext == null && p.nextOpponent == null ? "bye" : "ok";

  let score = 0;
  if (status === "ok") {
    if (p.projNext != null && form != null) score = 0.6 * p.projNext + 0.4 * form * matchupAdj;
    else score = p.projNext ?? (form ?? 0) * matchupAdj;
    if (p.injuryStatus === "Doubtful") score *= 0.4;
    if (p.injuryStatus === "Questionable") score *= 0.92;
  }

  return {
    score,
    form,
    matchupAdj,
    floor: p.floor == null ? null : p.floor * matchupAdj,
    ceiling: p.ceiling == null ? null : p.ceiling * matchupAdj,
    status,
  };
}
