// Publishes the weekly league newspaper: computes the week's facts, writes the stories, and
// stores the edition. Published editions never change unless you pass --force.
//
// Usage:
//    npm run paper                      # latest week with final scores
//    npm run paper -- --week 9
//    npm run paper -- --week 9 --force  # rewrite an edition that's already published
//
// Run `npm run league` first so the league's scores are current.

import { pool, query } from "../lib/db";
import { buildFacts } from "../lib/newspaper/facts";
import type { Edition } from "../lib/newspaper/types";
import { writeStories } from "../lib/newspaper/writer";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const leagueId =
    arg("league") ??
    process.env.LEAGUE_ID ??
    (await query<{ league_id: string }>(`SELECT league_id FROM leagues ORDER BY season DESC, updated_at DESC LIMIT 1`))[0]
      ?.league_id;
  if (!leagueId) throw new Error("No league imported. Run `npm run league -- --league <id>` first.");

  const [league] = await query<{ name: string; last_scored: number }>(
    `SELECT name, (settings->>'last_scored_leg')::int AS last_scored FROM leagues WHERE league_id = $1`,
    [leagueId],
  );
  const week = Number(arg("week") ?? league.last_scored);

  const existing = await query(`SELECT 1 FROM league_editions WHERE league_id = $1 AND week = $2`, [leagueId, week]);
  if (existing.length && !process.argv.includes("--force")) {
    console.log(`Week ${week} is already published. Pass --force to rewrite it.`);
    return;
  }

  const facts = await buildFacts(leagueId, week);
  const edition: Edition = { facts, stories: writeStories(facts) };

  await query(
    `INSERT INTO league_editions (league_id, week, writer, content) VALUES ($1, $2, 'template', $3)
		ON CONFLICT (league_id, week) DO UPDATE SET writer = EXCLUDED.writer, content = EXCLUDED.content, published_at = now()`,
    [leagueId, week, edition],
  );
  console.log(`✓ ${league.name}, week ${week}: "${edition.stories.lead.headline}"`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
