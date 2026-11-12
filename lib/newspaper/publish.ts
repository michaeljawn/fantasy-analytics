// Publishes an edition: computes the week's facts, writes the stories, and stores the result.
// Published editions never change unless `force` is set.

import { query } from "../db";
import { buildFacts } from "./facts";
import type { Edition } from "./types";
import { writeStories } from "./writer";

export type PublishResult =
  | { status: "published"; week: number; headline: string }
  | { status: "exists"; week: number }
  | { status: "none" }; // no final regular-season week yet

// The latest regular-season week with final scores
export async function latestFinalWeek(leagueId: string) {
  const [row] = await query<{ last_scored: number | null; playoff_start: number | null }>(
    `SELECT (settings->>'last_scored_leg')::int AS last_scored, (settings->>'playoff_week_start')::int AS playoff_start
		FROM leagues WHERE league_id = $1`,
    [leagueId],
  );
  if (!row) throw new Error(`League ${leagueId} isn't imported`);
  return Math.min(row.last_scored ?? 0, (row.playoff_start ?? 15) - 1);
}

export async function publishEdition(
  leagueId: string,
  opts: { week?: number; force?: boolean } = {},
): Promise<PublishResult> {
  const week = opts.week ?? (await latestFinalWeek(leagueId));
  if (week < 1) return { status: "none" };

  const existing = await query(`SELECT 1 FROM league_editions WHERE league_id = $1 AND week = $2`, [leagueId, week]);
  if (existing.length && !opts.force) return { status: "exists", week };

  const facts = await buildFacts(leagueId, week);
  const edition: Edition = { facts, stories: writeStories(facts) };
  await query(
    `INSERT INTO league_editions (league_id, week, writer, content) VALUES ($1, $2, 'template', $3)
		ON CONFLICT (league_id, week) DO UPDATE SET writer = EXCLUDED.writer, content = EXCLUDED.content, published_at = now()`,
    [leagueId, week, edition],
  );
  return { status: "published", week, headline: edition.stories.lead.headline };
}
