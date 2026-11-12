// Fantasy points under a Sleeper league's own scoring rules, from Sleeper's stat keys.
// Sleeper names its scoring rules after its stat keys (pass_td, rec, rec_yd, ...), so every
// rule is stat × multiplier, except per-position reception bonuses (bonus_rec_te = TE premium).
// Matches Sleeper's own players_points exactly for offensive players (checked on a full week).

export function leaguePoints(
  stats: Record<string, number | undefined>,
  position: string | null | undefined,
  scoring: Record<string, number>,
) {
  let points = 0;
  for (const [rule, value] of Object.entries(scoring)) {
    if (rule.startsWith("bonus_rec_")) {
      if (position === rule.slice("bonus_rec_".length).toUpperCase()) points += (stats.rec ?? 0) * value;
      continue;
    }
    const stat = stats[rule];
    if (stat != null) points += stat * value;
  }
  return Math.round(points * 100) / 100;
}
