import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Delta, Empty, InjuryTag, PlayerLink, PosBadge, fmt } from "@/components/ui";
import { getFormat, POSITIONS } from "@/lib/format";
import {
  getFormMovers,
  getPlayerSummaries,
  getPointsAllowed,
  getSeasonContext,
  getWeekLeaders,
} from "@/lib/queries";
import { safeLoad } from "@/lib/safe";
import { getTrending } from "@/lib/sleeper";

export default async function OverviewPage() {
  const format = await getFormat();

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    if (ctx.seasons.length === 0) throw new Error("No stats loaded.");
    // The latest week may be partially played; show the last complete one
    const leaderWeek = ctx.inSeason && ctx.lastWeek === ctx.upcomingWeek ? ctx.lastWeek - 1 : ctx.lastWeek;
    const [adds, hot, leaders, allowed] = await Promise.all([
      getTrending("add", 24, 25),
      getFormMovers(ctx.season, format, "up", 6),
      getWeekLeaders(ctx.season, leaderWeek, format, 8),
      getPointsAllowed(ctx, format),
    ]);
    const summaries = await getPlayerSummaries(adds.map((a) => a.playerId), ctx.season, format);
    const byId = new Map(summaries.map((s) => [s.player_id, s]));
    const waivers = adds.filter((a) => byId.has(a.playerId)).slice(0, 6).map((a) => ({ ...a, ...byId.get(a.playerId)! }));
    return { ctx, leaderWeek, waivers, hot, leaders, allowed };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { ctx, leaderWeek, waivers, hot, leaders, allowed } = result.data;

  const softest = POSITIONS.map((pos) => ({
    pos,
    rows: allowed.rows
      .filter((r) => r.position === pos)
      .sort((a, b) => a.softness_rank - b.softness_rank)
      .slice(0, 3),
  }));

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-ink-2">
          {ctx.season} season · {ctx.inSeason ? `Week ${ctx.upcomingWeek}` : "Offseason"}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Waiver buzz" subtitle="Most added on Sleeper, last 24h" action={<More href="/trending" />}>
          {waivers.length === 0 ? (
            <Empty>No trending data available.</Empty>
          ) : (
            <ul className="space-y-1">
              {waivers.map((w) => (
                <li key={w.playerId} className="flex items-center gap-2 py-1 text-sm">
                  <PosBadge position={w.position} />
                  <PlayerLink id={w.player_id} name={w.name} />
                  <span className="text-xs text-muted">{w.team ?? "FA"}</span>
                  <InjuryTag status={w.injury_status} />
                  <span className="tabular ml-auto text-xs text-ink-2">+{w.count.toLocaleString()}</span>
                  <span className="tabular w-16 text-right text-xs text-muted">{fmt(w.last3_avg)} L3</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Heating up" subtitle="Last 3 games vs. season average" action={<More href="/trending" />}>
          {hot.length === 0 ? (
            <Empty>Not enough games yet.</Empty>
          ) : (
            <ul className="space-y-1">
              {hot.map((r) => (
                <li key={r.player_id} className="flex items-center gap-2 py-1 text-sm">
                  <PosBadge position={r.position} />
                  <PlayerLink id={r.player_id} name={r.name} />
                  <span className="text-xs text-muted">{r.team ?? "FA"}</span>
                  <span className="ml-auto">
                    <Sparkline values={r.recent} width={72} height={20} />
                  </span>
                  <span className="w-14 text-right text-xs">
                    <Delta value={r.form_delta} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Week ${leaderWeek} top scorers`} action={<More href="/rankings?view=season" />}>
          {leaders.length === 0 ? (
            <Empty>No games yet.</Empty>
          ) : (
            <ol className="space-y-1">
              {leaders.map((l, i) => (
                <li key={l.player_id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="tabular w-4 text-xs text-muted">{i + 1}</span>
                  <PosBadge position={l.position} />
                  <PlayerLink id={l.player_id} name={l.name} />
                  <span className="text-xs text-muted">vs {l.opponent}</span>
                  <span className="tabular ml-auto font-medium">{l.points.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Softest defenses" subtitle={`Points allowed vs. league average, ${allowed.season}`} action={<More href="/matchups" />}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {softest.map(({ pos, rows }) => (
              <div key={pos}>
                <div className="mb-1 text-xs font-semibold text-ink-2">vs {pos}</div>
                <ul className="space-y-1 text-sm">
                  {rows.map((r) => (
                    <li key={r.defense} className="flex justify-between">
                      <span>{r.defense}</span>
                      <span className="tabular text-good">+{Math.round((r.matchup_factor - 1) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link href="/trade" className="rounded-lg border border-line bg-surface p-4 hover:border-accent">
          <div className="text-sm font-semibold">Trade calculator →</div>
          <p className="mt-1 text-xs text-ink-2">Value both sides of a deal and get suggestions to even it out.</p>
        </Link>
        <Link href="/start-sit" className="rounded-lg border border-line bg-surface p-4 hover:border-accent">
          <div className="text-sm font-semibold">Start/sit →</div>
          <p className="mt-1 text-xs text-ink-2">Compare players for Week {ctx.upcomingWeek} using projections, form, and matchup.</p>
        </Link>
      </div>
    </>
  );
}

function More({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-ink-2 hover:text-accent">
      More →
    </Link>
  );
}
