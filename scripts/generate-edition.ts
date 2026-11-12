// Publishes the weekly league newspaper (see lib/newspaper/publish.ts).
// Published editions never change unless you pass --force.
//
// Usage:
//    npm run paper                      # latest final week, for every imported league
//    npm run paper -- --league 1234567890 --week 9
//    npm run paper -- --week 9 --force  # rewrite an edition that's already published
//
// Run `npm run league` first so the league's scores are current.

import { query } from "../lib/db";
import { getCurrentLeagueIds } from "../lib/league-import";
import { publishEdition } from "../lib/newspaper/publish";
import { arg, run } from "./shared";

async function main() {
  const requested = arg("league");
  const leagueIds = requested ? [requested] : await getCurrentLeagueIds();
  if (leagueIds.length === 0) throw new Error("No league imported. Run `npm run league -- --league <id>` first.");
  const week = arg("week") ? Number(arg("week")) : undefined;

  for (const leagueId of leagueIds) {
    const [league] = await query<{ name: string }>(`SELECT name FROM leagues WHERE league_id = $1`, [leagueId]);
    const result = await publishEdition(leagueId, { week, force: process.argv.includes("--force") });
    if (result.status === "published") console.log(`✓ ${league.name}, week ${result.week}: "${result.headline}"`);
    else if (result.status === "exists") console.log(`${league.name}: week ${result.week} is already published. Pass --force to rewrite it.`);
    else console.log(`${league.name}: no regular-season week has final scores yet.`);
  }
}

run(main);
