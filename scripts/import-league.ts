// Imports Sleeper leagues into Postgres (see lib/league-import.ts). Follows previous_league_id
// to import past seasons too.
//
// Usage:
//    npm run league                         # refresh every league already imported (or LEAGUE_ID if none)
//    npm run league -- --league 1234567890
//    npm run league -- --league 1234567890 --no-history   # this season only

import { getCurrentLeagueIds, importLeague } from "../lib/league-import";
import { arg, run } from "./shared";

async function main() {
  const requested = arg("league");
  let leagueIds = requested ? [requested] : await getCurrentLeagueIds();
  if (leagueIds.length === 0 && process.env.LEAGUE_ID) leagueIds = [process.env.LEAGUE_ID];
  if (leagueIds.length === 0) throw new Error("Pass --league <id> or set LEAGUE_ID in .env.local");
  const history = !process.argv.includes("--no-history");

  for (const start of leagueIds) {
    let leagueId: string | null = start;
    while (leagueId) {
      const league = await importLeague(leagueId, console.log);
      leagueId = history ? league.previous_league_id : null;
    }
  }
  console.log("✓ League import complete");
}

run(main);
