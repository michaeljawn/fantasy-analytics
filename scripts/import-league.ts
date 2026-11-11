// Imports a Sleeper league into Postgres: settings, owners, rosters, weekly matchups,
// transactions, and traded picks. Follows previous_league_id to import past seasons too.
//
// Usage:
//    npm run league                         # league in LEAGUE_ID (.env.local)
//    npm run league -- --league 1234567890
//    npm run league -- --league 1234567890 --no-history   # this season only
//
// Docs: https://docs.sleeper.com/#leagues

import { arg, fetchJson, pool, run, SLEEPER_V1, sleep, upsert } from "./shared";

const WEEKS = 18;

type SleeperLeague = {
  league_id: string;
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

// Sleeper stores points as an integer plus a two-digit decimal, e.g. fpts 1680 + fpts_decimal 99
const points = (s: SleeperRoster["settings"], key: string) =>
  s[key] == null ? null : (s[key] ?? 0) + (s[`${key}_decimal`] ?? 0) / 100;

function avatarUrl(u: SleeperUser) {
  if (u.metadata?.avatar) return u.metadata.avatar;
  return u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null;
}

async function importLeague(leagueId: string): Promise<SleeperLeague> {
  const league = await get<SleeperLeague>(`/league/${leagueId}`);
  if (!league?.league_id) throw new Error(`League ${leagueId} not found`);
  const id = league.league_id;
  console.log(`${league.name} (${league.season}, ${league.status})`);

  await upsert(
    "leagues",
    ["league_id", "season", "name", "avatar", "status", "previous_league_id", "total_rosters", "roster_positions", "scoring_settings", "settings"],
    ["league_id"],
    [[
      id, Number(league.season), league.name, league.avatar, league.status, league.previous_league_id,
      league.total_rosters, league.roster_positions, league.scoring_settings, league.settings,
    ]],
  );

  const [users, rosters] = await Promise.all([
    get<SleeperUser[]>(`/league/${id}/users`),
    get<SleeperRoster[]>(`/league/${id}/rosters`),
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
  console.log(`  ✓ ${users.length} managers, ${rosters.length} rosters`);

  // The schedule is set for the whole season, so future weeks come back with pairings and 0 points
  let matchupRows = 0;
  for (let week = 1; week <= WEEKS; week++) {
    const matchups = await get<SleeperMatchup[]>(`/league/${id}/matchups/${week}`);
    await upsert(
      "league_matchups",
      ["league_id", "week", "roster_id", "matchup_id", "points", "starters", "starters_points", "players_points"],
      ["league_id", "week", "roster_id"],
      matchups.map((m) => [
        id, week, m.roster_id, m.matchup_id, m.points ?? 0, m.starters ?? [], m.starters_points ?? [], m.players_points ?? {},
      ]),
    );
    matchupRows += matchups.length;
    await sleep(100);
  }
  console.log(`  ✓ ${matchupRows} team-weeks`);

  const lastWeek = league.status === "complete" ? WEEKS : Math.min(league.settings.leg ?? WEEKS, WEEKS);
  const transactions: SleeperTransaction[] = [];
  for (let week = 1; week <= lastWeek; week++) {
    transactions.push(...(await get<SleeperTransaction[]>(`/league/${id}/transactions/${week}`)));
    await sleep(100);
  }
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
  console.log(`  ✓ ${transactions.length} transactions`);

  // Picks can be traded back to their original owner, so replace rather than merge
  const picks = await get<SleeperTradedPick[]>(`/league/${id}/traded_picks`);
  await pool.query(`DELETE FROM league_traded_picks WHERE league_id = $1`, [id]);
  await upsert(
    "league_traded_picks",
    ["league_id", "season", "round", "roster_id", "owner_id", "previous_owner_id"],
    ["league_id", "season", "round", "roster_id"],
    picks.map((p) => [id, Number(p.season), p.round, p.roster_id, p.owner_id, p.previous_owner_id]),
  );
  console.log(`  ✓ ${picks.length} traded picks`);

  return league;
}

async function main() {
  let leagueId: string | null = arg("league") ?? process.env.LEAGUE_ID ?? null;
  if (!leagueId) throw new Error("Pass --league <id> or set LEAGUE_ID in .env.local");
  const history = !process.argv.includes("--no-history");

  while (leagueId) {
    const league = await importLeague(leagueId);
    leagueId = history ? league.previous_league_id : null;
  }
  console.log("✓ League import complete");
}

run(main);
