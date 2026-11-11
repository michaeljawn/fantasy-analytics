import { query } from "../db";
import type { Edition } from "./types";

export type EditionRow = { week: number; content: Edition; writer: string; published_at: Date };

// A specific week, or the latest edition when week is omitted
export async function getEdition(leagueId: string, week?: number) {
  const rows = await query<EditionRow>(
    `SELECT week, content, writer, published_at FROM league_editions
		WHERE league_id = $1 AND ($2::int IS NULL OR week = $2)
		ORDER BY week DESC LIMIT 1`,
    [leagueId, week ?? null],
  );
  return rows[0] ?? null;
}

export async function listEditions(leagueId: string) {
  return query<{ week: number; headline: string; published_at: Date }>(
    `SELECT week, content->'stories'->'lead'->>'headline' AS headline, published_at
		FROM league_editions WHERE league_id = $1 ORDER BY week DESC`,
    [leagueId],
  );
}
