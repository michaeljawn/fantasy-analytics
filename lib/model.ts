// Player outlook model shared by rankings, trade values, and start/sit.
//
// Outlook (points per game going forward) blends three signals:
//   1. Sleeper projections for the next few weeks
//   2. This season's production (season average + last-3 form)
//   3. Last season's average, which fades out as this season's sample grows
// Value is points per game above a waiver-level replacement at the position.

import { query } from "./db";
import { projectionColumn, type Format, type Position } from "./formats";

export type LeagueSettings = {
  teams: number;
  superflex: boolean;
};

export const DEFAULT_LEAGUE: LeagueSettings = { teams: 12, superflex: false };

// Starters per team at each position (flex spots spread across RB/WR/TE)
const STARTERS: Record<Position, number> = { QB: 1, RB: 2.5, WR: 3, TE: 1.25 };

// How much of a player's outlook survives each injury designation
const AVAILABILITY: Record<string, number> = {
  Questionable: 0.97,
  Doubtful: 0.85,
  Out: 0.8,
  PUP: 0.5,
  Sus: 0.6,
  IR: 0.35,
};

export type PlayerOutlook = {
  playerId: string;
  name: string;
  position: Position;
  team: string | null;
  injuryStatus: string | null;
  age: number | null;
  games: number;
  seasonAvg: number | null;
  last3Avg: number | null;
  prevAvg: number | null;
  floor: number | null;
  ceiling: number | null;
  projNext: number | null;
  projAvg: number | null;
  nextOpponent: string | null;
  outlook: number; // projected points per game, before injury discount
  availability: number;
  replacement: number;
  vor: number; // outlook × availability − replacement
  value: number; // 0–100 redraft trade value
  dynastyValue: number; // 0–100 dynasty trade value (same scale as draft picks)
  posRank: number;
};

// ──────────────────────────────────────────────
// Dynasty: age curves
// ──────────────────────────────────────────────

// Share of peak production expected at each age, by position: [last peak age, yearly decline after it]
// RBs fall off a cliff in their late 20s; QBs hold value well into their 30s.
const AGE_CURVE: Record<Position, { peakThrough: number; decline: number[] }> = {
  RB: { peakThrough: 25, decline: [0.95, 0.85, 0.72, 0.6, 0.48] },
  WR: { peakThrough: 27, decline: [0.97, 0.92, 0.85, 0.76, 0.66, 0.55] },
  TE: { peakThrough: 28, decline: [0.95, 0.9, 0.82, 0.73, 0.63] },
  QB: { peakThrough: 32, decline: [0.97, 0.93, 0.88, 0.8, 0.7, 0.58] },
};

const DYNASTY_YEARS = 5;
const DYNASTY_DISCOUNT = 0.8; // a point next year is worth 80% of a point this year
const ASSUMED_AGE = 26;

export function ageMultiplier(position: Position, age: number): number {
  const { peakThrough, decline } = AGE_CURVE[position];
  if (age <= 23) return 1.05; // still developing
  if (age <= peakThrough) return 1;
  const yearsPast = age - peakThrough;
  if (yearsPast <= decline.length) return decline[yearsPast - 1];
  return Math.max(0, decline[decline.length - 1] - 0.12 * (yearsPast - decline.length));
}

// Discounted sum of expected production over the next few seasons, relative to this season.
// This season's share is scaled by availability so a season-ending injury hurts, but not forever.
export function longevity(position: Position, age: number | null, availability = 1): number {
  const start = age ?? ASSUMED_AGE;
  let total = 0;
  for (let y = 0; y < DYNASTY_YEARS; y++) {
    total += DYNASTY_DISCOUNT ** y * ageMultiplier(position, start + y) * (y === 0 ? availability : 1);
  }
  return total;
}

type OutlookRow = {
  player_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  team: string | null;
  injury_status: string | null;
  age: number | null;
  games: number | null;
  avg_points: number | null;
  last3_avg: number | null;
  floor_points: number | null;
  ceiling_points: number | null;
  prev_avg: number | null;
  proj_next: number | null;
  proj_avg: number | null;
  next_opp: string | null;
};

export function estimateOutlook(r: {
  games: number;
  seasonAvg: number | null;
  last3Avg: number | null;
  prevAvg: number | null;
  projAvg: number | null;
}): number {
  let form: number | null = null;
  if (r.games > 0 && r.seasonAvg != null) {
    const current = r.games >= 3 && r.last3Avg != null ? 0.65 * r.seasonAvg + 0.35 * r.last3Avg : r.seasonAvg;
    const weight = Math.min(r.games, 4) / 4;
    form = r.prevAvg != null ? weight * current + (1 - weight) * r.prevAvg : current;
  } else if (r.prevAvg != null) {
    form = r.prevAvg * 0.9; // regress a season-old sample
  }

  if (r.projAvg != null && form != null) return 0.5 * r.projAvg + 0.5 * form;
  return r.projAvg ?? form ?? 0;
}

export async function getOutlooks(
  season: number,
  upcomingWeek: number,
  format: Format,
  league: LeagueSettings = DEFAULT_LEAGUE,
): Promise<PlayerOutlook[]> {
  const col = projectionColumn(format);
  const rows = await query<OutlookRow>(
    `WITH cur AS (
		SELECT * FROM v_season_summary WHERE season = $1 AND format = $2
	),
	prev AS (
		SELECT player_id, avg_points FROM v_season_summary
			WHERE season = $1 - 1 AND format = $2 AND games >= 4
	),
	proj AS (
		SELECT player_id,
			AVG(${col})                              AS proj_avg,
			MAX(${col}) FILTER (WHERE week = $3)     AS proj_next,
			MAX(opponent) FILTER (WHERE week = $3)   AS next_opp
			FROM projections
			WHERE season = $1 AND week BETWEEN $3 AND $3 + 2
			GROUP BY player_id
	)
	SELECT p.player_id, p.first_name, p.last_name, p.position, p.team, p.injury_status, p.age,
		cur.games, cur.avg_points, cur.last3_avg, cur.floor_points, cur.ceiling_points,
		prev.avg_points AS prev_avg, proj.proj_next, proj.proj_avg, proj.next_opp
		FROM players p
		LEFT JOIN cur  ON cur.player_id  = p.player_id
		LEFT JOIN prev ON prev.player_id = p.player_id
		LEFT JOIN proj ON proj.player_id = p.player_id
		WHERE cur.player_id IS NOT NULL
			OR proj.player_id IS NOT NULL
			OR (prev.player_id IS NOT NULL AND p.active AND p.team IS NOT NULL)`,
    [season, format, upcomingWeek],
  );

  const players = rows.map((r) => {
    const base = {
      games: r.games ?? 0,
      seasonAvg: r.avg_points,
      last3Avg: r.last3_avg,
      prevAvg: r.prev_avg,
      projAvg: r.proj_avg,
    };
    return {
      playerId: r.player_id,
      name: `${r.first_name} ${r.last_name}`,
      position: r.position,
      team: r.team,
      injuryStatus: r.injury_status,
      age: r.age,
      ...base,
      floor: r.floor_points,
      ceiling: r.ceiling_points,
      projNext: r.proj_next,
      nextOpponent: r.next_opp,
      outlook: estimateOutlook(base),
      availability: AVAILABILITY[r.injury_status ?? ""] ?? 1,
      replacement: 0,
      vor: 0,
      value: 0,
      dynastyValue: 0,
      posRank: 0,
    } satisfies PlayerOutlook;
  });

  // Replacement level = outlook of the first player outside the league's starters
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    const group = players
      .filter((p) => p.position === pos)
      .sort((a, b) => b.outlook * b.availability - a.outlook * a.availability);
    const starters = pos === "QB" && league.superflex ? 2 : STARTERS[pos];
    const cutoff = Math.min(Math.round(starters * league.teams), group.length - 1);
    const replacement = cutoff >= 0 ? group[cutoff].outlook * group[cutoff].availability : 0;
    group.forEach((p, i) => {
      p.posRank = i + 1;
      p.replacement = replacement;
      p.vor = p.outlook * p.availability - replacement;
    });
  }

  // Trade value: points above a waiver-level player (80% of replacement), scaled to 0–100
  const raw = players.map((p) => Math.max(0, p.outlook * p.availability - 0.8 * p.replacement));
  const max = Math.max(...raw, 1);
  players.forEach((p, i) => (p.value = Math.round((1000 * raw[i]) / max) / 10));

  // Dynasty value: the same points-above-waiver edge, carried forward along the player's age curve
  const dynastyRaw = players.map(
    (p) => Math.max(0, p.outlook - 0.8 * p.replacement) * longevity(p.position, p.age, p.availability),
  );
  const dynastyMax = Math.max(...dynastyRaw, 1);
  players.forEach((p, i) => (p.dynastyValue = Math.round((1000 * dynastyRaw[i]) / dynastyMax) / 10));

  return players.sort((a, b) => b.value - a.value);
}

