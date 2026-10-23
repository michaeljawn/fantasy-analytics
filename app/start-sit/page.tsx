import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader } from "@/components/ui";
import { getFormat } from "@/lib/format";
import { getOutlooks } from "@/lib/model";
import { getPointsAllowed, getSeasonContext, matchupLookup } from "@/lib/queries";
import { safeLoad } from "@/lib/safe";
import { scoreStartSit } from "@/lib/startsit";
import { StartSit, type StartSitPlayer } from "./StartSit";

export default async function StartSitPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const format = await getFormat();

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    const [outlooks, allowed] = await Promise.all([getOutlooks(ctx.season, ctx.upcomingWeek, format), getPointsAllowed(ctx, format)]);
    return { ctx, outlooks, allowed };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { ctx, outlooks, allowed } = result.data;
  const matchup = matchupLookup(allowed.rows);

  const players: StartSitPlayer[] = outlooks.map((o) => {
    const m = matchup(o.nextOpponent, o.position);
    return {
      id: o.playerId,
      name: o.name,
      position: o.position,
      team: o.team,
      injury: o.injuryStatus,
      value: o.value,
      projNext: o.projNext,
      seasonAvg: o.seasonAvg,
      last3Avg: o.last3Avg,
      opponent: o.nextOpponent,
      matchupFactor: m?.matchup_factor ?? null,
      softnessRank: m?.softness_rank ?? null,
      ...scoreStartSit({ ...o, matchupFactor: m?.matchup_factor ?? null }),
    };
  });

  return (
    <>
      <PageHeader
        title={`Start/sit · Week ${ctx.upcomingWeek}`}
        description={`Score = 60% Sleeper projection + 40% recent form adjusted for matchup. Matchup compares what the opponent allows to the position against league average (${allowed.season} data). The range shows each player's typical floor to ceiling for this matchup.`}
      />
      <StartSit players={players} initialIds={ids?.split(",").filter(Boolean) ?? []} />
    </>
  );
}
