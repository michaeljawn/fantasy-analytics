// Loads players, weekly stats, and projections from the Sleeper API into Postgres.
//
// Usage:
//    npm run ingest                         # current season, all weeks to date + upcoming projections
//    npm run ingest -- --seasons 2023-2026  # backfill several seasons
//    npm run ingest -- --seasons 2026 --weeks 7
//
// Docs: https://docs.sleeper.com

import { Pool } from "pg";

const SLEEPER_V1 = "https://api.sleeper.app/v1";
const SLEEPER_STATS = "https://api.sleeper.com";
const POSITIONS = ["QB", "RB", "WR", "TE"];
const REGULAR_SEASON_WEEKS = 18;
const PROJECTION_WEEKS_AHEAD = 2;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://fantasy:fantasy@localhost:5433/fantasy",
});

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
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  injury_status?: string | null;
  active?: boolean;
};

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "FantasyAnalytics/2.0" } });
      if (res.status === 429) throw new Error("rate limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url}: ${(err as Error).message}`);
      await sleep(1500 * attempt);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function positionQuery() {
  return POSITIONS.map((p) => `position[]=${p}`).join("&");
}

function isSkillPlayer(r: SleeperStatRow) {
  return POSITIONS.includes(r.player?.position ?? "");
}

// ──────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────

async function loadPlayers() {
  console.log("Fetching player registry (~5 MB)…");
  const registry = await fetchJson<Record<string, SleeperPlayer>>(`${SLEEPER_V1}/players/nfl`);

  const rows = Object.entries(registry)
    .filter(([, p]) => p.position && POSITIONS.includes(p.position) && p.first_name && p.last_name)
    .map(([id, p]) => [
      id, p.first_name, p.last_name, p.position, p.team ?? null,
      p.age ?? null, p.years_exp ?? null, p.injury_status ?? null, p.active ?? false,
    ]);

  await upsert(
    "players",
    ["player_id", "first_name", "last_name", "position", "team", "age", "years_exp", "injury_status", "active"],
    ["player_id"],
    rows,
  );
  console.log(`  ✓ ${rows.length} players`);
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
  const played = rows.filter((r) => (r.stats?.gp ?? 0) > 0 && isSkillPlayer(r));
  await ensurePlayers(played);

  const n = (s: SleeperStats, k: string) => Math.round(s[k] ?? 0);
  const values = played.map((r) => {
    const s = r.stats;
    return [
      r.player_id, season, week, r.team, r.opponent, r.date,
      n(s, "pass_att"), n(s, "pass_cmp"), n(s, "pass_yd"), n(s, "pass_td"), n(s, "pass_int"),
      n(s, "rush_att"), n(s, "rush_yd"), n(s, "rush_td"),
      n(s, "rec_tgt"), n(s, "rec"), n(s, "rec_yd"), n(s, "rec_td"),
      n(s, "pass_2pt") + n(s, "rush_2pt") + n(s, "rec_2pt"), n(s, "fum_lost"),
      n(s, "off_snp"), n(s, "tm_off_snp"),
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
  const projected = rows.filter((r) => (r.stats?.pts_ppr ?? 0) > 0 && isSkillPlayer(r));
  await ensurePlayers(projected);

  const values = projected.map((r) => [
    r.player_id, season, week, r.team, r.opponent, r.date,
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

async function upsert(
  table: string,
  columns: string[],
  key: string[],
  rows: unknown[][],
  opts: { doNothing?: boolean } = {},
) {
  const updates = columns.filter((c) => !key.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  const conflict = opts.doNothing
    ? "DO NOTHING"
    : `DO UPDATE SET ${updates.join(", ")}${table === "players" ? ", updated_at = now()" : ""}`;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}
       ON CONFLICT (${key.join(", ")}) ${conflict}`,
      params,
    );
  }
}

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const state = await fetchJson<{ season: string; week: number; season_type: string }>(`${SLEEPER_V1}/state/nfl`);
  const currentSeason = Number(state.season);
  const currentWeek = state.season_type === "regular" ? state.week : state.season_type === "pre" ? 0 : REGULAR_SEASON_WEEKS;

  const seasons = parseRange(arg("seasons") ?? String(currentSeason));
  const weeksArg = arg("weeks");

  await loadPlayers();

  for (const season of seasons) {
    const lastWeek = season === currentSeason ? currentWeek : REGULAR_SEASON_WEEKS;
    const weeks = weeksArg ? parseRange(weeksArg) : parseRange(`1-${lastWeek}`);

    for (const week of weeks.filter((w) => w >= 1 && w <= lastWeek)) {
      const count = await loadWeekStats(season, week);
      console.log(`  ${season} week ${week}: ${count} player-games`);
      await sleep(200);
    }

    if (season === currentSeason) {
      const upcoming = Math.max(currentWeek, 1);
      for (let week = upcoming; week <= Math.min(upcoming + PROJECTION_WEEKS_AHEAD, REGULAR_SEASON_WEEKS); week++) {
        const count = await loadWeekProjections(season, week);
        console.log(`  ${season} week ${week}: ${count} projections`);
      }
    }
  }

  console.log("✓ Ingest complete");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
