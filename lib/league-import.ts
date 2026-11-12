// Imports a Sleeper league into Postgres: settings, owners, rosters, weekly matchups,
// transactions, and traded picks. Used by `npm run league` and by "Add a league" on the site.
//
// Docs: https://docs.sleeper.com/#leagues

import { pool, query } from "./db";
import { fetchJson, SLEEPER_V1, upsert } from "./importer";

const WEEKS = 18;

type SleeperLeague = {
  league_id: string;
  sport: string;
  season: string;
  name: string;
  avatar: string | null;
  status: string;
  previous_league_id: string | null;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
};

type SleeperUser = {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner: boolean | null;
  metadata?: { team_name?: string; avatar?: string } | null;
};

type SleeperRoster = {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  metadata?: { record?: string } | null;
  settings: Record<string, number | undefined>;
};

type SleeperMatchup = {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  starters: string[] | null;
  starters_points: number[] | null;
  players_points: Record<string, number> | null;
};

type SleeperTransaction = {
  transaction_id: string;
  type: string;
  status: string;
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: unknown[];
  waiver_budget: unknown[];
  settings: { waiver_bid?: number } | null;
};

type SleeperTradedPick = {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number | null;
};

const get = <T>(path: string) => fetchJson<T>(`${SLEEPER_V1}${path}`);
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// Sleeper stores points as an integer plus a two-digit decimal, e.g. fpts 1680 + fpts_decimal 99
const points = (s: SleeperRoster["settings"], key: string) =>
  s[key] == null ? null : (s[key] ?? 0) + (s[`${key}_decimal`] ?? 0) / 100;

function avatarUrl(u: SleeperUser) {
  if (u.metadata?.avatar) return u.metadata.avatar;
  return u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null;
}

export type ImportedLeague = { league_id: string; name: string; season: number; previous_league_id: string | null };

export async function importLeague(leagueId: string, log: (msg: string) => void = () => {}): Promise<ImportedLeague> {
  // Sleeper answers unknown IDs with null rather than a 404
  const league = await get<SleeperLeague | null>(`/league/${leagueId}`).catch(() => null);
  if (!league?.league_id) throw new Error(`No Sleeper league with ID ${leagueId}`);
  if (league.sport !== "nfl") throw new Error(`${league.name} isn't an NFL league`);
  const id = league.league_id;
  log(`${league.name} (${league.season}, ${league.status})`);

  await upsert(
    "leagues",
    ["league_id", "season", "name", "avatar", "status", "previous_league_id", "total_rosters", "roster_positions", "scoring_settings", "settings"],
    ["league_id"],
    [[
      id, Number(league.season), league.name, league.avatar, league.status, league.previous_league_id,
      league.total_rosters, league.roster_positions, league.scoring_settings, league.settings,
    ]],
  );

  // The schedule is set for the whole season, so future weeks come back with pairings and 0 points
  const lastWeek = league.status === "complete" ? WEEKS : Math.min(league.settings.leg ?? WEEKS, WEEKS);
  const [users, rosters, weeks, transactionWeeks, picks] = await Promise.all([
    get<SleeperUser[]>(`/league/${id}/users`),
    get<SleeperRoster[]>(`/league/${id}/rosters`),
    Promise.all(range(WEEKS).map((w) => get<SleeperMatchup[]>(`/league/${id}/matchups/${w}`))),
    Promise.all(range(lastWeek).map((w) => get<SleeperTransaction[]>(`/league/${id}/transactions/${w}`))),
    get<SleeperTradedPick[]>(`/league/${id}/traded_picks`),
  ]);

  await upsert(
    "league_users",
    ["league_id", "user_id", "display_name", "team_name", "avatar_url", "is_owner"],
    ["league_id", "user_id"],
    users.map((u) => [id, u.user_id, u.display_name.trim(), u.metadata?.team_name?.trim() || null, avatarUrl(u), u.is_owner ?? false]),
  );

  await upsert(
    "league_rosters",
    [
      "league_id", "roster_id", "owner_id", "co_owner_ids", "wins", "losses", "ties",
      "points_for", "points_against", "max_points_for", "waiver_budget_used", "record",
    ],
    ["league_id", "roster_id"],
    rosters.map((r) => [
      id, r.roster_id, r.owner_id, r.co_owners ?? [], r.settings.wins ?? 0, r.settings.losses ?? 0, r.settings.ties ?? 0,
      points(r.settings, "fpts") ?? 0, points(r.settings, "fpts_against") ?? 0, points(r.settings, "ppts"),
      r.settings.waiver_budget_used ?? 0, r.metadata?.record ?? null,
    ]),
  );

  // Rosters change all the time, so replace them rather than merge
  await pool.query(`DELETE FROM league_roster_players WHERE league_id = $1`, [id]);
  await upsert(
    "league_roster_players",
    ["league_id", "roster_id", "player_id", "slot", "slot_index"],
    ["league_id", "roster_id", "player_id"],
    rosters.flatMap((r) => {
      const starters = r.starters ?? [];
      const reserve = new Set(r.reserve ?? []);
      const taxi = new Set(r.taxi ?? []);
      return (r.players ?? []).map((p) => {
        const index = starters.indexOf(p);
        const slot = index >= 0 ? "starter" : reserve.has(p) ? "reserve" : taxi.has(p) ? "taxi" : "bench";
        return [id, r.roster_id, p, slot, index >= 0 ? index : null];
      });
    }),
  );
  log(`  ✓ ${users.length} managers, ${rosters.length} rosters`);

  const matchupRows = weeks.flatMap((matchups, i) =>
    matchups.map((m) => [
      id, i + 1, m.roster_id, m.matchup_id, m.points ?? 0, m.starters ?? [], m.starters_points ?? [], m.players_points ?? {},
    ]),
  );
  await upsert(
    "league_matchups",
    ["league_id", "week", "roster_id", "matchup_id", "points", "starters", "starters_points", "players_points"],
    ["league_id", "week", "roster_id"],
    matchupRows,
  );
  log(`  ✓ ${matchupRows.length} team-weeks`);

  const transactions = transactionWeeks.flat();
  await upsert(
    "league_transactions",
    [
      "transaction_id", "league_id", "week", "type", "status", "created_at", "roster_ids",
      "adds", "drops", "draft_picks", "waiver_budget", "waiver_bid",
    ],
    ["transaction_id"],
    transactions.map((t) => [
      t.transaction_id, id, t.leg, t.type, t.status, new Date(t.created), t.roster_ids ?? [],
      t.adds ?? {}, t.drops ?? {}, JSON.stringify(t.draft_picks ?? []), JSON.stringify(t.waiver_budget ?? []),
      t.settings?.waiver_bid ?? null,
    ]),
  );
  log(`  ✓ ${transactions.length} transactions`);

  // Picks can be traded back to their original owner, so replace rather than merge
  await pool.query(`DELETE FROM league_traded_picks WHERE league_id = $1`, [id]);
  await upsert(
    "league_traded_picks",
    ["league_id", "season", "round", "roster_id", "owner_id", "previous_owner_id"],
    ["league_id", "season", "round", "roster_id"],
    picks.map((p) => [id, Number(p.season), p.round, p.roster_id, p.owner_id, p.previous_owner_id]),
  );
  log(`  ✓ ${picks.length} traded picks`);

  return { league_id: id, name: league.name, season: Number(league.season), previous_league_id: league.previous_league_id };
}

// Every imported league that hasn't been renewed into a newer season
export async function getCurrentLeagueIds() {
  const rows = await query<{ league_id: string }>(
    `SELECT l.league_id FROM leagues l
		WHERE NOT EXISTS (SELECT 1 FROM leagues n WHERE n.previous_league_id = l.league_id)
		ORDER BY l.season DESC, l.name`,
  );
  return rows.map((r) => r.league_id);
}

// ──────────────────────────────────────────────
// Finding a manager's leagues
// ──────────────────────────────────────────────

export type SleeperLeagueSummary = { league_id: string; name: string; avatar: string | null; season: string; total_rosters: number };

export async function findUserLeagues(username: string) {
  const user = await get<{ user_id: string; display_name: string } | null>(`/user/${encodeURIComponent(username)}`).catch(() => null);
  if (!user?.user_id) return null;
  const state = await get<{ league_season: string; season: string }>(`/state/nfl`);
  const leagues = await get<SleeperLeagueSummary[]>(`/user/${user.user_id}/leagues/nfl/${state.league_season ?? state.season}`);
  return { user, leagues: leagues ?? [] };
}
