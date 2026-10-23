import { query } from "./db";
import { projectionColumn, type Format, type Position } from "./formats";
import { getNflState } from "./sleeper";

// ──────────────────────────────────────────────
// Season context
// ──────────────────────────────────────────────

export type SeasonContext = {
  season: number; // latest season with data
  lastWeek: number; // latest week with stats in that season
  upcomingWeek: number; // week to project / set lineups for
  seasons: number[];
  inSeason: boolean;
};

export async function getSeasonContext(): Promise<SeasonContext> {
  const [state, rows] = await Promise.all([
    getNflState(),
    query<{ season: number; last_week: number }>(
      `SELECT season, MAX(week) AS last_week FROM weekly_stats GROUP BY season ORDER BY season DESC`,
    ),
  ]);
  const latest = rows[0] ?? { season: state.season, last_week: 0 };
  const inSeason = state.seasonType === "regular" && latest.season === state.season;
  return {
    season: latest.season,
    lastWeek: latest.last_week,
    upcomingWeek: inSeason ? state.week : latest.last_week + 1,
    seasons: rows.map((r) => r.season),
    inSeason,
  };
}

// ──────────────────────────────────────────────
// Rankings
// ──────────────────────────────────────────────

export type SeasonRow = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
  injury_status: string | null;
  games: number;
  total_points: number;
  avg_points: number;
  stddev_points: number;
  floor_points: number;
  ceiling_points: number;
  best_week: number;
  last3_avg: number | null;
  avg_snap_share: number | null;
  avg_targets: number;
  avg_rush_att: number;
  boom_rate: number;
  bust_rate: number;
};

export async function getSeasonRankings(season: number, format: Format, position: Position | "ALL") {
  return query<SeasonRow>(
    `SELECT s.*, p.first_name || ' ' || p.last_name AS name, p.team, p.injury_status
		FROM v_season_summary s
		JOIN players p ON p.player_id = s.player_id
		WHERE s.season = $1 AND s.format = $2 AND ($3 = 'ALL' OR s.position = $3)
		ORDER BY s.total_points DESC`,
    [season, format, position],
  );
}

// ──────────────────────────────────────────────
// Player profile
// ──────────────────────────────────────────────

export type PlayerInfo = {
  player_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  injury_status: string | null;
};

export type GameLogRow = {
  season: number;
  week: number;
  team: string | null;
  opponent: string | null;
  points: number;
  pos_rank: number;
  snap_share: number | null;
  passing_yds: number;
  passing_tds: number;
  interceptions: number;
  rush_att: number;
  rushing_yds: number;
  rushing_tds: number;
  targets: number;
  receptions: number;
  receiving_yds: number;
  receiving_tds: number;
};

export async function getPlayer(playerId: string) {
  const rows = await query<PlayerInfo>(
    `SELECT player_id, first_name, last_name, position, team, age, years_exp, injury_status
		FROM players WHERE player_id = $1`,
    [playerId],
  );
  return rows[0] ?? null;
}

export async function getGameLog(playerId: string, format: Format) {
  return query<GameLogRow>(
    `SELECT r.season, r.week, r.team, r.opponent, r.points, r.pos_rank, r.snap_share,
			w.passing_yds, w.passing_tds, w.interceptions, w.rush_att, w.rushing_yds, w.rushing_tds,
			w.targets, w.receptions, w.receiving_yds, w.receiving_tds
		FROM v_weekly_ranks r
		JOIN weekly_stats w ON w.player_id = r.player_id AND w.season = r.season AND w.week = r.week
		WHERE r.player_id = $1 AND r.format = $2
		ORDER BY r.season DESC, r.week`,
    [playerId, format],
  );
}

export async function getPlayerSeasons(playerId: string, format: Format) {
  return query<SeasonRow & { season: number }>(
    `SELECT s.*, '' AS name, NULL AS team, NULL AS injury_status
		FROM v_season_summary s
		WHERE s.player_id = $1 AND s.format = $2
		ORDER BY s.season DESC`,
    [playerId, format],
  );
}

export type ProjectionRow = { week: number; opponent: string | null; points: number };

export async function getPlayerProjections(playerId: string, season: number, format: Format) {
  return query<ProjectionRow>(
    `SELECT week, opponent, ${projectionColumn(format)} AS points
		FROM projections WHERE player_id = $1 AND season = $2 ORDER BY week`,
    [playerId, season],
  );
}

// ──────────────────────────────────────────────
// Matchups
// ──────────────────────────────────────────────

export type MatchupRow = {
  defense: string;
  position: Position;
  games: number;
  points_allowed_pg: number;
  league_avg_pg: number;
  matchup_factor: number;
  softness_rank: number;
};

// Uses last season's numbers until the current season has a few weeks of data
export async function getPointsAllowed(ctx: SeasonContext, format: Format) {
  const season = ctx.lastWeek >= 4 || !ctx.seasons.includes(ctx.season - 1) ? ctx.season : ctx.season - 1;
  const rows = await query<MatchupRow>(
    `SELECT defense, position, games, points_allowed_pg, league_avg_pg, matchup_factor, softness_rank
		FROM v_points_allowed WHERE season = $1 AND format = $2`,
    [season, format],
  );
  return { season, rows };
}

export function matchupLookup(rows: MatchupRow[]) {
  const map = new Map(rows.map((r) => [`${r.defense}:${r.position}`, r]));
  return (defense: string | null, position: string) => (defense ? map.get(`${defense}:${position}`) : undefined);
}

// ──────────────────────────────────────────────
// Weekly leaders & trends
// ──────────────────────────────────────────────

export type WeekLeader = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
  opponent: string | null;
  points: number;
  pos_rank: number;
};

export async function getWeekLeaders(season: number, week: number, format: Format, limit = 10) {
  return query<WeekLeader>(
    `SELECT r.player_id, p.first_name || ' ' || p.last_name AS name, r.position, r.team, r.opponent,
			r.points, r.pos_rank
		FROM v_weekly_ranks r
		JOIN players p ON p.player_id = r.player_id
		WHERE r.season = $1 AND r.week = $2 AND r.format = $3
		ORDER BY r.points DESC LIMIT $4`,
    [season, week, format, limit],
  );
}

export type FormRow = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
  games: number;
  avg_points: number;
  last3_avg: number;
  form_delta: number;
  avg_snap_share: number | null;
  last3_snap_share: number | null;
  recent: number[];
  recent_weeks: number[];
};

// Biggest gaps between last-3-week average and season average
export async function getFormMovers(season: number, format: Format, direction: "up" | "down", limit = 15) {
  return query<FormRow>(
    `SELECT s.player_id, p.first_name || ' ' || p.last_name AS name, s.position, p.team,
			s.games, s.avg_points, s.last3_avg,
			ROUND(s.last3_avg - s.avg_points, 2) AS form_delta,
			s.avg_snap_share, s.last3_snap_share,
			ARRAY(
				SELECT fp.points FROM v_fantasy_points fp
				WHERE fp.player_id = s.player_id AND fp.season = s.season AND fp.format = s.format
				ORDER BY fp.week
			) AS recent,
			ARRAY(
				SELECT fp.week FROM v_fantasy_points fp
				WHERE fp.player_id = s.player_id AND fp.season = s.season AND fp.format = s.format
				ORDER BY fp.week
			) AS recent_weeks
		FROM v_season_summary s
		JOIN players p ON p.player_id = s.player_id
		WHERE s.season = $1 AND s.format = $2 AND s.games >= 4 AND s.avg_points >= 5
		ORDER BY form_delta ${direction === "up" ? "DESC" : "ASC"}
		LIMIT $3`,
    [season, format, limit],
  );
}

// Snap share risers: role growth often shows up before the points do
export async function getUsageRisers(season: number, format: Format, limit = 10) {
  return query<FormRow>(
    `SELECT s.player_id, p.first_name || ' ' || p.last_name AS name, s.position, p.team,
			s.games, s.avg_points, s.last3_avg,
			ROUND(s.last3_avg - s.avg_points, 2) AS form_delta,
			s.avg_snap_share, s.last3_snap_share, ARRAY[]::NUMERIC[] AS recent, ARRAY[]::INT[] AS recent_weeks
		FROM v_season_summary s
		JOIN players p ON p.player_id = s.player_id
		WHERE s.season = $1 AND s.format = $2 AND s.games >= 4 AND s.position <> 'QB'
			AND s.last3_snap_share IS NOT NULL
		ORDER BY s.last3_snap_share - s.avg_snap_share DESC
		LIMIT $3`,
    [season, format, limit],
  );
}

export type PlayerLookup = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
  injury_status: string | null;
};

export async function getPlayersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return query<PlayerLookup>(
    `SELECT player_id, first_name || ' ' || last_name AS name, position, team, injury_status
		FROM players WHERE player_id = ANY($1)`,
    [ids],
  );
}

export async function searchPlayers(term: string, limit = 8) {
  return query<PlayerLookup>(
    `SELECT p.player_id, p.first_name || ' ' || p.last_name AS name, p.position, p.team, p.injury_status
		FROM players p
		WHERE (p.first_name || ' ' || p.last_name) ILIKE '%' || $1 || '%'
		ORDER BY EXISTS (SELECT 1 FROM weekly_stats w WHERE w.player_id = p.player_id) DESC,
			p.active DESC, p.last_name
		LIMIT $2`,
    [term, limit],
  );
}

export type PlayerSummary = PlayerLookup & {
  games: number | null;
  avg_points: number | null;
  last3_avg: number | null;
  last3_snap_share: number | null;
};

export async function getPlayerSummaries(ids: string[], season: number, format: Format) {
  if (ids.length === 0) return [];
  return query<PlayerSummary>(
    `SELECT p.player_id, p.first_name || ' ' || p.last_name AS name, p.position, p.team, p.injury_status,
			s.games, s.avg_points, s.last3_avg, s.last3_snap_share
		FROM players p
		LEFT JOIN v_season_summary s ON s.player_id = p.player_id AND s.season = $2 AND s.format = $3
		WHERE p.player_id = ANY($1)`,
    [ids, season, format],
  );
}
