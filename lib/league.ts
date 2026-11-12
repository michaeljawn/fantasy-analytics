import { cookies } from "next/headers";
import { query } from "./db";

// The league the site is built around: LEAGUE_ID, or else the most recent season imported
export async function getLeagueId(): Promise<string | null> {
  if (process.env.LEAGUE_ID) return process.env.LEAGUE_ID;
  const rows = await query<{ league_id: string }>(
    `SELECT league_id FROM leagues ORDER BY season DESC, updated_at DESC LIMIT 1`,
  );
  return rows[0]?.league_id ?? null;
}

// ──────────────────────────────────────────────
// League settings
// ──────────────────────────────────────────────

export type League = {
  league_id: string;
  season: number;
  name: string;
  avatar: string | null;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
};

export type LeagueInfo = League & {
  currentWeek: number; // the week being played now (or next)
  lastScoredWeek: number; // latest week with final scores
  playoffWeekStart: number;
  playoffTeams: number;
  tags: string[]; // e.g. Dynasty, Superflex, PPR, TE premium
};

export async function getLeague(leagueId: string): Promise<LeagueInfo | null> {
  const rows = await query<League>(
    `SELECT league_id, season, name, avatar, status, total_rosters, roster_positions, scoring_settings, settings
		FROM leagues WHERE league_id = $1`,
    [leagueId],
  );
  const league = rows[0];
  if (!league) return null;
  const s = league.settings;
  const lastScoredWeek = league.status === "complete" ? (s.playoff_week_start ?? 15) - 1 : (s.last_scored_leg ?? 0);
  return {
    ...league,
    currentWeek: s.leg ?? lastScoredWeek + 1,
    lastScoredWeek,
    playoffWeekStart: s.playoff_week_start ?? 15,
    playoffTeams: s.playoff_teams ?? 6,
    tags: leagueTags(league),
  };
}

function leagueTags(league: League) {
  const scoring = league.scoring_settings;
  const slots = league.roster_positions;
  const rec = scoring.rec ?? 0;
  return [
    league.settings.type === 2 ? "Dynasty" : league.settings.type === 1 ? "Keeper" : "Redraft",
    `${league.total_rosters} teams`,
    slots.includes("SUPER_FLEX") || slots.filter((p) => p === "QB").length > 1 ? "Superflex" : null,
    rec >= 1 ? "PPR" : rec > 0 ? "Half PPR" : "Standard",
    (scoring.bonus_rec_te ?? 0) > 0 ? `TE premium (+${scoring.bonus_rec_te})` : null,
    (scoring.pass_td ?? 4) !== 4 ? `${scoring.pass_td}-pt pass TD` : null,
  ].filter((t): t is string => t != null);
}

// Display label for a starting slot
export function slotLabel(slot: string) {
  return slot === "SUPER_FLEX" ? "SF" : slot === "REC_FLEX" ? "W/T" : slot === "WRRB_FLEX" ? "W/R" : slot;
}

// ──────────────────────────────────────────────
// Teams and standings
// ──────────────────────────────────────────────

export type Team = {
  roster_id: number;
  owner_id: string | null;
  team_name: string;
  display_name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  max_points_for: number | null;
  record: string | null;
};

// Standings order: wins, then points for (Sleeper's default tiebreaker)
export async function getTeams(leagueId: string) {
  return query<Team>(
    `SELECT r.roster_id, r.owner_id,
			COALESCE(u.team_name, 'Team ' || u.display_name, 'Team ' || r.roster_id) AS team_name,
			COALESCE(u.display_name, 'Open team') AS display_name,
			u.avatar_url, r.wins, r.losses, r.ties, r.points_for, r.points_against, r.max_points_for, r.record
		FROM league_rosters r
		LEFT JOIN league_users u ON u.league_id = r.league_id AND u.user_id = r.owner_id
		WHERE r.league_id = $1
		ORDER BY r.wins DESC, r.ties DESC, r.points_for DESC`,
    [leagueId],
  );
}

// Current streak from the record string, e.g. "WWLWW" → "W2"
export function streak(record: string | null) {
  if (!record) return null;
  const last = record.at(-1)!;
  let n = 0;
  for (let i = record.length - 1; i >= 0 && record[i] === last; i--) n++;
  return `${last}${n}`;
}

// ──────────────────────────────────────────────
// Matchups
// ──────────────────────────────────────────────

export type MatchupSide = {
  roster_id: number;
  points: number;
  top_starter: { player_id: string; name: string; position: string | null; points: number } | null;
};

export type Matchup = { matchup_id: number; home: MatchupSide; away: MatchupSide };

export async function getWeekMatchups(leagueId: string, week: number): Promise<Matchup[]> {
  const rows = await query<{
    roster_id: number;
    matchup_id: number;
    points: number;
    starters: string[];
    starters_points: number[];
  }>(
    `SELECT roster_id, matchup_id, points, starters, starters_points
		FROM league_matchups
		WHERE league_id = $1 AND week = $2 AND matchup_id IS NOT NULL
		ORDER BY matchup_id, roster_id`,
    [leagueId, week],
  );

  // Each team's highest-scoring starter
  const tops = rows.map((r) => {
    let best = -1;
    r.starters_points.forEach((p, i) => {
      if (r.starters[i] !== "0" && (best < 0 || p > r.starters_points[best])) best = i;
    });
    return best >= 0 && r.starters_points[best] > 0 ? { id: r.starters[best], points: r.starters_points[best] } : null;
  });
  const names = await getPlayerNames(tops.flatMap((t) => (t ? [t.id] : [])));

  const sides = rows.map((r, i): MatchupSide & { matchup_id: number } => {
    const top = tops[i];
    const player = top ? names.get(top.id) : undefined;
    return {
      matchup_id: r.matchup_id,
      roster_id: r.roster_id,
      points: r.points,
      top_starter: top ? { player_id: top.id, name: player?.name ?? "Unknown player", position: player?.position ?? null, points: top.points } : null,
    };
  });

  const matchups: Matchup[] = [];
  for (let i = 0; i < sides.length; i += 2) {
    const [home, away] = [sides[i], sides[i + 1]];
    if (home && away && home.matchup_id === away.matchup_id) matchups.push({ matchup_id: home.matchup_id, home, away });
  }
  return matchups;
}

// Weeks that have a regular-season schedule
export async function getScheduleWeeks(leagueId: string, playoffWeekStart: number) {
  const rows = await query<{ week: number }>(
    `SELECT DISTINCT week FROM league_matchups
		WHERE league_id = $1 AND matchup_id IS NOT NULL AND week < $2 ORDER BY week`,
    [leagueId, playoffWeekStart],
  );
  return rows.map((r) => r.week);
}

// ──────────────────────────────────────────────
// Rosters
// ──────────────────────────────────────────────

export type RosterPlayer = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  injury_status: string | null;
  slot: "starter" | "bench" | "reserve" | "taxi";
  slot_index: number | null;
};

const SLOT_ORDER = `CASE rp.slot WHEN 'starter' THEN 0 WHEN 'bench' THEN 1 WHEN 'taxi' THEN 2 ELSE 3 END`;
const POSITION_ORDER = `CASE p.position WHEN 'QB' THEN 0 WHEN 'RB' THEN 1 WHEN 'WR' THEN 2 WHEN 'TE' THEN 3 ELSE 4 END`;

export async function getRoster(leagueId: string, rosterId: number) {
  return query<RosterPlayer>(
    `SELECT rp.player_id, COALESCE(p.first_name || ' ' || p.last_name, 'Player ' || rp.player_id) AS name,
			p.position, p.team, p.injury_status, rp.slot, rp.slot_index
		FROM league_roster_players rp
		LEFT JOIN players p ON p.player_id = rp.player_id
		WHERE rp.league_id = $1 AND rp.roster_id = $2
		ORDER BY ${SLOT_ORDER}, rp.slot_index, ${POSITION_ORDER}, name`,
    [leagueId, rosterId],
  );
}

async function getPlayerNames(ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; position: string }>();
  const rows = await query<{ player_id: string; name: string; position: string }>(
    `SELECT player_id, first_name || ' ' || last_name AS name, position FROM players WHERE player_id = ANY($1)`,
    [ids],
  );
  return new Map(rows.map((r) => [r.player_id, r]));
}

// ──────────────────────────────────────────────
// My team (cookie)
// ──────────────────────────────────────────────

export const MY_TEAM_COOKIE = "team";

// The signed-in-ish user: whichever manager this browser picked. Stored by user_id so it
// carries over to next season's league.
export async function getMyUserId() {
  return (await cookies()).get(MY_TEAM_COOKIE)?.value ?? null;
}
