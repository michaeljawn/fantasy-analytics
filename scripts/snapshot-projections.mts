// Saves a timestamped snapshot of Sleeper's weekly projections, so we have the numbers exactly as they
// stood before kickoff. Sleeper's historical projections are edited after games, so they can't be used
// for training without leaking results (see issue #20).
//
// Usage:
//    node scripts/snapshot-projections.mts [outputDir]   # default: snapshots
//
// Writes <outputDir>/<season>/week-<WW>/<timestamp>.json.gz for the current and next week, skipping
// weeks whose projections haven't changed since the last snapshot. No dependencies, so the scheduled
// GitHub Action can run it without an npm install.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const SLEEPER_V1 = "https://api.sleeper.app/v1";
const SLEEPER_STATS = "https://api.sleeper.com";
const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

type ProjectionRow = {
  player_id: string;
  team: string | null;
  opponent: string | null;
  date: string | null;
  game_id: string | null;
  last_modified: number | null;
  stats: Record<string, number>;
};

type Snapshot = {
  captured_at: string;
  season: number;
  week: number;
  content_hash: string;
  rows: ProjectionRow[];
};

const weeksInSeason = (season: number) => (season >= 2021 ? 18 : 17);

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "FantasyAnalytics/2.0" } }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    if (attempt >= 3) throw new Error(`${url}: ${res ? `HTTP ${res.status}` : "network error"}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function fetchProjections(season: number, week: number): Promise<ProjectionRow[]> {
  const positions = POSITIONS.map((p) => `position[]=${p}`).join("&");
  const raw = await fetchJson<(ProjectionRow & { stats?: Record<string, number> })[]>(
    `${SLEEPER_STATS}/projections/nfl/${season}/${week}?season_type=regular&${positions}`,
  );
  return raw
    .filter((r) => r.player_id && r.stats && Object.keys(r.stats).length > 0)
    .map((r) => ({
      player_id: r.player_id,
      team: r.team ?? null,
      opponent: r.opponent ?? null,
      date: r.date ?? null,
      game_id: r.game_id ?? null,
      last_modified: r.last_modified ?? null,
      stats: r.stats!,
    }))
    .sort((a, b) => a.player_id.localeCompare(b.player_id));
}

// Hash only the projection values, not Sleeper's timestamps, so a re-save with identical numbers isn't a change
function hashRows(rows: ProjectionRow[]): string {
  const values = rows.map((r) => [r.player_id, r.team, r.opponent, r.date, r.stats]);
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function latestHash(dir: string): string | null {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  const latest = JSON.parse(gunzipSync(readFileSync(join(dir, files.at(-1)!))).toString()) as Snapshot;
  return latest.content_hash;
}

async function main() {
  const outDir = process.argv[2] ?? "snapshots";
  const state = await fetchJson<{ season: string; week: number; season_type: string }>(`${SLEEPER_V1}/state/nfl`);
  const season = Number(state.season);

  if (state.season_type === "post" || state.season_type === "off") {
    console.log(`Season type is "${state.season_type}"; nothing to snapshot.`);
    return;
  }

  // Preseason reports week 0; snapshot week 1. Otherwise this week plus next (Thursday games roll the week over).
  const first = state.season_type === "pre" ? 1 : Math.max(state.week, 1);
  const weeks = [first, first + 1].filter((w) => w <= weeksInSeason(season));
  const capturedAt = new Date().toISOString();
  const changed: string[] = [];

  for (const week of weeks) {
    const rows = await fetchProjections(season, week);
    if (rows.length === 0) {
      console.log(`  ${season} week ${week}: no projections yet`);
      continue;
    }
    const dir = join(outDir, String(season), `week-${String(week).padStart(2, "0")}`);
    const hash = hashRows(rows);
    if (hash === latestHash(dir)) {
      console.log(`  ${season} week ${week}: unchanged (${rows.length} players)`);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    const snapshot: Snapshot = { captured_at: capturedAt, season, week, content_hash: hash, rows };
    const file = join(dir, `${capturedAt.replace(/[:.]/g, "-")}.json.gz`);
    writeFileSync(file, gzipSync(JSON.stringify(snapshot)));
    changed.push(`${season}-w${week}`);
    console.log(`  ${season} week ${week}: saved ${rows.length} players → ${file}`);
  }

  // Let the GitHub Action know whether there's anything to commit
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.join(",")}\n`);
  console.log(changed.length ? `✓ Saved ${changed.join(", ")}` : "✓ No changes since last snapshot");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
