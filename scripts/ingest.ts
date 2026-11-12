// Loads players, weekly stats, and projections from the Sleeper API into Postgres.
//
// Usage:
//    npm run ingest                         # current season, all weeks to date + upcoming projections
//    npm run ingest -- --seasons 2014-2026  # backfill several seasons (full coverage starts in 2014)
//    npm run ingest -- --seasons 2026 --weeks 7
//
// Docs: https://docs.sleeper.com

import { arg, fetchJson, pool, run, SLEEPER_V1, sleep, upsert } from "./shared";

const SLEEPER_STATS = "https://api.sleeper.com";
const POSITIONS = ["QB", "RB", "WR", "TE"];
const PROJECTION_WEEKS_AHEAD = 2;

// The regular season grew from 17 to 18 weeks in 2021
const weeksInSeason = (season: number) => (season >= 2021 ? 18 : 17);

// Relocated franchises use their current code, so a defense's history lines up across seasons
const TEAM_ALIASES: Record<string, string> = { OAK: "LV", SD: "LAC", STL: "LAR", LA: "LAR", JAC: "JAX", WSH: "WAS" };
const team = (code: string | null | undefined) => (code ? (TEAM_ALIASES[code] ?? code) : null);

// ──────────────────────────────────────────────
// Sleeper API helpers
// ──────────────────────────────────────────────

type SleeperStats = Record<string, number | undefined>;

type SleeperStatRow = {
  player_id: string;
  team: string | null;
  opponent: string | null;
  date: string | null;
  stats: SleeperStats;
  player?: { first_name?: string; last_name?: string; position?: string };
};

type SleeperPlayer = {
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[] | null;
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  injury_status?: string | null;
  birth_date?: string | null;
  active?: boolean;
};

function positionQuery() {
  return POSITIONS.map((p) => `position[]=${p}`).join("&");
}

// Offensive position for fantasy purposes. Two-way players are listed by their primary position
// (Travis Hunter is a DB with WR eligibility), so fall back to their offensive eligibility.
// Fullbacks stay out: Sleeper's position filter matches them as RBs.
function skillPosition(p: SleeperPlayer) {
  if (p.position && POSITIONS.includes(p.position)) return p.position;
  if (p.position === "FB") return undefined;
  return p.fantasy_positions?.find((f) => POSITIONS.includes(f));
}

// player_id → offensive position, from the current registry (filled by loadPlayers)
const registryPositions = new Map<string, string>();

function isSkillPlayer(r: SleeperStatRow) {
  return registryPositions.has(r.player_id) || POSITIONS.includes(r.player?.position ?? "");
}

// Some older weeks list the same player-game twice under different game IDs (e.g. 2015 week 1)
function onePerPlayer(rows: SleeperStatRow[], label: string): SleeperStatRow[] {
  const seen = new Map<string, SleeperStatRow>();
  for (const r of rows) if (!seen.has(r.player_id)) seen.set(r.player_id, r);
  const dropped = rows.length - seen.size;
  if (dropped > 0) console.log(`    ${label}: dropped ${dropped} duplicate rows`);
  return [...seen.values()];
}

// ──────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────

async function loadPlayers() {
  console.log("Fetching player registry (~5 MB)…");
  const registry = await fetchJson<Record<string, SleeperPlayer>>(`${SLEEPER_V1}/players/nfl`);

  // Kickers and team defenses are stored too, so league rosters can show their names, but they
  // stay out of registryPositions: there are no K/DEF stats or projections yet (#17)
  const lineupOnly = new Map<string, string>();
  for (const [id, p] of Object.entries(registry)) {
    const position = skillPosition(p);
    if (position && p.first_name && p.last_name) registryPositions.set(id, position);
    else if ((p.position === "K" || p.position === "DEF") && p.first_name && p.last_name) lineupOnly.set(id, p.position);
  }

  const rows = [...registryPositions, ...lineupOnly].map(([id, position]) => {
    const p = registry[id];
    return [
      id, p.first_name, p.last_name, position, team(p.team),
      p.age ?? null, p.years_exp ?? null, p.injury_status ?? null, p.birth_date || null, p.active ?? false,
    ];
  });

  await upsert(
    "players",
    ["player_id", "first_name", "last_name", "position", "team", "age", "years_exp", "injury_status", "birth_date", "active"],
    ["player_id"],
    rows,
  );
  console.log(`  ✓ ${registryPositions.size} players, plus ${lineupOnly.size} kickers and defenses`);
}

// Players that appear in historical stats but are no longer in the registry
async function ensurePlayers(rows: SleeperStatRow[]) {
  const missing = rows
    .filter((r) => r.player?.first_name && r.player?.last_name && r.player?.position)
    .map((r) => [r.player_id, r.player!.first_name, r.player!.last_name, r.player!.position, null, null, null, null, false]);
  await upsert(
    "players",
    ["player_id", "first_name", "last_name", "position", "team", "age", "years_exp", "injury_status", "active"],
    ["player_id"],
    missing,
    { doNothing: true },
  );
}

async function loadWeekStats(season: number, week: number) {
  const rows = await fetchJson<SleeperStatRow[]>(
    `${SLEEPER_STATS}/stats/nfl/${season}/${week}?season_type=regular&${positionQuery()}`,
  );
  // Only weeks the player actually took the field (skips byes, inactives, and DNPs).
  // Sleeper's position filter also matches secondary positions (e.g. FBs), so check the primary one.
  const played = onePerPlayer(
    rows.filter((r) => (r.stats?.gp ?? 0) > 0 && isSkillPlayer(r)),
    `${season} week ${week} stats`,
  );
  await ensurePlayers(played);

  const n = (s: SleeperStats, k: string) => Math.round(s[k] ?? 0);
  // Snap counts only exist from 2020; store unknown as NULL so it isn't read as a 0% snap share
  const nOrNull = (s: SleeperStats, k: string) => (s[k] == null ? null : Math.round(s[k]!));
  const values = played.map((r) => {
    const s = r.stats;
    return [
      r.player_id, season, week, team(r.team), team(r.opponent), r.date,
      n(s, "pass_att"), n(s, "pass_cmp"), n(s, "pass_yd"), n(s, "pass_td"), n(s, "pass_int"),
      n(s, "rush_att"), n(s, "rush_yd"), n(s, "rush_td"),
      n(s, "rec_tgt"), n(s, "rec"), n(s, "rec_yd"), n(s, "rec_td"),
      n(s, "pass_2pt") + n(s, "rush_2pt") + n(s, "rec_2pt"), n(s, "fum_lost"),
      nOrNull(s, "off_snp"), nOrNull(s, "tm_off_snp"),
    ];
  });

  await upsert(
    "weekly_stats",
    [
      "player_id", "season", "week", "team", "opponent", "game_date",
      "pass_att", "pass_cmp", "passing_yds", "passing_tds", "interceptions",
      "rush_att", "rushing_yds", "rushing_tds",
      "targets", "receptions", "receiving_yds", "receiving_tds",
      "two_pt", "fumbles_lost", "off_snaps", "team_off_snaps",
    ],
    ["player_id", "season", "week"],
    values,
  );
  await logIngest(season, week, "stats", values.length);
  return values.length;
}

async function loadWeekProjections(season: number, week: number) {
  const rows = await fetchJson<SleeperStatRow[]>(
    `${SLEEPER_STATS}/projections/nfl/${season}/${week}?season_type=regular&${positionQuery()}`,
  );
  const projected = onePerPlayer(
    rows.filter((r) => (r.stats?.pts_ppr ?? 0) > 0 && isSkillPlayer(r)),
    `${season} week ${week} projections`,
  );
  await ensurePlayers(projected);

  const values = projected.map((r) => [
    r.player_id, season, week, team(r.team), team(r.opponent), r.date,
    r.stats.pts_std ?? 0, r.stats.pts_half_ppr ?? 0, r.stats.pts_ppr ?? 0,
  ]);
  await upsert(
    "projections",
    ["player_id", "season", "week", "team", "opponent", "game_date", "pts_std", "pts_half", "pts_ppr"],
    ["player_id", "season", "week"],
    values,
  );
  await logIngest(season, week, "proj", values.length);
  return values.length;
}

// ──────────────────────────────────────────────
// SQL helpers
// ──────────────────────────────────────────────

async function logIngest(season: number, week: number, kind: string, count: number) {
  await pool.query(
    `INSERT INTO ingest_log (season, week, kind, rows_loaded) VALUES ($1, $2, $3, $4)
     ON CONFLICT (season, week, kind) DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded, loaded_at = now()`,
    [season, week, kind, count],
  );
}

// ──────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────

function parseRange(value: string): number[] {
  const out = new Set<number>();
  for (const part of value.split(",")) {
    const [start, end] = part.trim().split("-").map(Number);
    for (let i = start; i <= (end ?? start); i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

async function main() {
  const state = await fetchJson<{ season: string; week: number; season_type: string }>(`${SLEEPER_V1}/state/nfl`);
  const currentSeason = Number(state.season);
  const currentWeek = state.season_type === "regular" ? state.week : state.season_type === "pre" ? 0 : weeksInSeason(currentSeason);

  const seasons = parseRange(arg("seasons") ?? String(currentSeason));
  const weeksArg = arg("weeks");

  await loadPlayers();

  for (const season of seasons) {
    const lastWeek = season === currentSeason ? currentWeek : weeksInSeason(season);
    const weeks = weeksArg ? parseRange(weeksArg) : parseRange(`1-${lastWeek}`);

    for (const week of weeks.filter((w) => w >= 1 && w <= lastWeek)) {
      const count = await loadWeekStats(season, week);
      console.log(`  ${season} week ${week}: ${count} player-games`);
      await sleep(200);
    }

    if (season === currentSeason) {
      const upcoming = Math.max(currentWeek, 1);
      for (let week = upcoming; week <= Math.min(upcoming + PROJECTION_WEEKS_AHEAD, weeksInSeason(season)); week++) {
        const count = await loadWeekProjections(season, week);
        console.log(`  ${season} week ${week}: ${count} projections`);
      }
    }
  }

  console.log("✓ Ingest complete");
}

run(main);
