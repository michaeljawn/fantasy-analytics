// Gameday: every player you start this week across all your leagues, grouped by NFL game,
// with live points and projections in each league's own scoring. Lineups and points come
// straight from Sleeper (refreshed every minute), so lineup changes show up right away.

import { query } from "./db";
import { getMyLeagueIds, getMyUserId } from "./league";
import { leaguePoints } from "./newspaper/scoring";
import { getNflState } from "./sleeper";

const SLEEPER_V1 = "https://api.sleeper.app/v1";
const SLEEPER_STATS = "https://api.sleeper.com";
const LIVE = { next: { revalidate: 60 } };

export type GameStatus = "pre_game" | "in_game" | "complete";

export type Game = {
  id: string;
  date: string; // game day, Eastern (e.g. "2026-11-12")
  kickoff: string; // ISO timestamp
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  quarter: number | null;
  clock: string | null;
  channel: string | null;
};

export type Appearance = {
  leagueId: string;
  leagueName: string;
  points: number; // live, in this league's scoring
  projected: number | null;
};

export type GamedayPlayer = {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  leagues: Appearance[];
};

export type LeagueMatchup = {
  leagueId: string;
  leagueName: string;
  avatar: string | null;
  me: { teamName: string; points: number; projected: number };
  opponent: { teamName: string; points: number; projected: number } | null;
  warnings: string[];
};

export type GamedayGame = Game & { mine: GamedayPlayer[]; against: GamedayPlayer[] };

export type Gameday = {
  week: number;
  season: number;
  userId: string | null;
  leagueCount: number; // leagues where this browser's manager has a team
  matchups: LeagueMatchup[];
  days: string[];
  games: GamedayGame[];
  notPlaying: GamedayPlayer[]; // your starters on bye or without a team
};

type SleeperMatchup = {
  roster_id: number;
  matchup_id: number | null;
  starters: string[] | null;
  players_points: Record<string, number> | null;
  points: number | null;
};

type ScoreRow = {
  game_id: string;
  date: string;
  status: string;
  metadata: {
    away_team: string;
    home_team: string;
    date_time: string;
    away_score?: number;
    home_score?: number;
    quarter_num?: number | string;
    time_remaining?: string;
    channel?: string;
    has_started?: boolean;
    is_in_progress?: boolean;
    is_over?: boolean;
  };
};

export async function getGameday(): Promise<Gameday> {
  const [state, userId, leagueIds] = await Promise.all([getNflState(), getMyUserId(), getMyLeagueIds()]);
  const { season, week } = state;
  const empty = { week, season, userId, leagueCount: 0, matchups: [], days: [], games: [], notPlaying: [] };
  if (!userId || leagueIds.length === 0) return empty;

  // My roster in each league (owner or co-owner)
  const leagues = await query<{
    league_id: string;
    name: string;
    avatar: string | null;
    scoring_settings: Record<string, number>;
    roster_id: number;
  }>(
    `SELECT l.league_id, l.name, l.avatar, l.scoring_settings, r.roster_id
		FROM leagues l
		JOIN league_rosters r ON r.league_id = l.league_id
		WHERE l.league_id = ANY($1) AND (r.owner_id = $2 OR $2 = ANY(r.co_owner_ids))`,
    [leagueIds, userId],
  );
  if (leagues.length === 0) return { ...empty };

  const [schedule, projectionRows, liveMatchups] = await Promise.all([
    getSchedule(season, week),
    getProjectionStats(season, week),
    Promise.all(leagues.map((l) => fetchJson<SleeperMatchup[]>(`${SLEEPER_V1}/league/${l.league_id}/matchups/${week}`))),
  ]);

  // Names of everyone starting in my matchups, both sides
  const ids = new Set<string>();
  const rows = leagues.map((league, i) => {
    const all = liveMatchups[i] ?? [];
    const mine = all.find((m) => m.roster_id === league.roster_id);
    const opp = mine?.matchup_id != null ? all.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== league.roster_id) : undefined;
    for (const m of [mine, opp]) m?.starters?.forEach((id) => id !== "0" && ids.add(id));
    return { league, mine, opp };
  });
  const players = await getPlayers([...ids]);
  const teamNames = await getTeamNames(rows.flatMap((r) => [r.mine, r.opp].flatMap((m) => (m ? [{ league: r.league.league_id, roster: m.roster_id }] : []))));

  const projected = (league: (typeof leagues)[number], id: string) => {
    const stats = projectionRows.get(id);
    return stats ? leaguePoints(stats, players.get(id)?.position, league.scoring_settings) : null;
  };

  const mineById = new Map<string, GamedayPlayer>();
  const againstById = new Map<string, GamedayPlayer>();
  const matchups: LeagueMatchup[] = [];
  const gameByTeam = new Map(schedule.flatMap((g) => [[g.away, g] as const, [g.home, g] as const]));

  for (const { league, mine, opp } of rows) {
    if (!mine) continue;
    const warnings: string[] = [];
    const side = (m: SleeperMatchup, into: Map<string, GamedayPlayer>, own: boolean) => {
      let proj = 0;
      for (const id of m.starters ?? []) {
        if (id === "0") {
          if (own) warnings.push("Empty starting slot");
          continue;
        }
        const p = players.get(id);
        const points = m.players_points?.[id] ?? 0;
        const projection = projected(league, id);
        // A finished game's projection is just its points
        const game = p?.team ? gameByTeam.get(p.team) : undefined;
        proj += game?.status === "complete" ? points : game?.status === "in_game" ? Math.max(points, projection ?? 0) : (projection ?? 0);
        if (own && p && !game) warnings.push(`${p.name} is on bye`);
        else if (own && p && (p.injuryStatus === "Out" || p.injuryStatus === "IR")) warnings.push(`${p.name} is ${p.injuryStatus === "IR" ? "on IR" : "out"}`);

        const entry = into.get(id) ?? {
          playerId: id,
          name: p?.name ?? `Player ${id}`,
          position: p?.position ?? null,
          team: p?.team ?? null,
          injuryStatus: p?.injuryStatus ?? null,
          leagues: [],
        };
        entry.leagues.push({ leagueId: league.league_id, leagueName: league.name, points, projected: projection });
        into.set(id, entry);
      }
      return proj;
    };

    const myProjected = side(mine, mineById, true);
    const oppProjected = opp ? side(opp, againstById, false) : 0;
    matchups.push({
      leagueId: league.league_id,
      leagueName: league.name,
      avatar: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
      me: { teamName: teamNames.get(`${league.league_id}:${mine.roster_id}`) ?? "My team", points: mine.points ?? 0, projected: round1(myProjected) },
      opponent: opp
        ? { teamName: teamNames.get(`${league.league_id}:${opp.roster_id}`) ?? "Opponent", points: opp.points ?? 0, projected: round1(oppProjected) }
        : null,
      warnings,
    });
  }

  const byGame = (map: Map<string, GamedayPlayer>, game: Game) =>
    [...map.values()]
      .filter((p) => p.team === game.away || p.team === game.home)
      .sort((a, b) => b.leagues.length - a.leagues.length || total(b) - total(a));

  const games = schedule.map((g) => ({ ...g, mine: byGame(mineById, g), against: byGame(againstById, g) }));
  const notPlaying = [...mineById.values()].filter((p) => !p.team || !gameByTeam.has(p.team));

  return {
    week,
    season,
    userId,
    leagueCount: matchups.length,
    matchups,
    days: [...new Set(schedule.map((g) => g.date))],
    games,
    notPlaying,
  };
}

const total = (p: GamedayPlayer) => p.leagues.reduce((s, l) => s + (l.projected ?? 0), 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function fetchJson<T>(url: string, init: RequestInit & { next?: { revalidate: number } } = LIVE): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// This week's NFL games in kickoff order, with live scores
async function getSchedule(season: number, week: number): Promise<Game[]> {
  const rows = (await fetchJson<ScoreRow[]>(`${SLEEPER_STATS}/scores/nfl/regular/${season}/${week}`)) ?? [];
  return rows
    .map((r) => {
      const m = r.metadata;
      const quarter = Number(m.quarter_num);
      const status: GameStatus =
        m.is_over || r.status === "complete" ? "complete" : m.is_in_progress || m.has_started ? "in_game" : "pre_game";
      return {
        id: r.game_id,
        date: r.date,
        kickoff: m.date_time,
        away: m.away_team,
        home: m.home_team,
        awayScore: status === "pre_game" ? null : (m.away_score ?? 0),
        homeScore: status === "pre_game" ? null : (m.home_score ?? 0),
        status,
        quarter: Number.isFinite(quarter) && quarter > 0 ? quarter : null,
        clock: m.time_remaining ?? null,
        channel: m.channel ?? null,
      };
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.away.localeCompare(b.away));
}

// Sleeper's projected stats for every position, scored later with each league's rules
async function getProjectionStats(season: number, week: number) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
  const rows =
    (await fetchJson<{ player_id: string; stats: Record<string, number> }[]>(
      `${SLEEPER_STATS}/projections/nfl/${season}/${week}?season_type=regular&${positions}`,
      { next: { revalidate: 900 } },
    )) ?? [];
  return new Map(rows.map((r) => [r.player_id, r.stats ?? {}]));
}

async function getPlayers(ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; position: string | null; team: string | null; injuryStatus: string | null }>();
  const rows = await query<{ player_id: string; name: string; position: string | null; team: string | null; injury_status: string | null }>(
    `SELECT player_id, first_name || ' ' || last_name AS name, position, team, injury_status FROM players WHERE player_id = ANY($1)`,
    [ids],
  );
  return new Map(rows.map((r) => [r.player_id, { name: r.name, position: r.position, team: r.team, injuryStatus: r.injury_status }]));
}

async function getTeamNames(keys: { league: string; roster: number }[]) {
  if (keys.length === 0) return new Map<string, string>();
  const rows = await query<{ league_id: string; roster_id: number; name: string }>(
    `SELECT r.league_id, r.roster_id, COALESCE(u.team_name, 'Team ' || u.display_name, 'Team ' || r.roster_id) AS name
		FROM league_rosters r
		LEFT JOIN league_users u ON u.league_id = r.league_id AND u.user_id = r.owner_id
		WHERE r.league_id = ANY($1)`,
    [[...new Set(keys.map((k) => k.league))]],
  );
  return new Map(rows.map((r) => [`${r.league_id}:${r.roster_id}`, r.name]));
}

// How many NFL games are on right now (for the live dot on the Gameday button)
export async function getLiveGameCount(): Promise<number> {
  try {
    const { season, week } = await getNflState();
    return (await getSchedule(season, week)).filter((g) => g.status === "in_game").length;
  } catch {
    return 0;
  }
}
