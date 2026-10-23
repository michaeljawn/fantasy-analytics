import { Sparkline } from "@/components/charts/Sparkline";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Delta, Empty, InjuryTag, PageHeader, PlayerLink, PosBadge, Segmented, fmt, pct } from "@/components/ui";
import { getFormat } from "@/lib/format";
import {
  getFormMovers,
  getPlayerSummaries,
  getSeasonContext,
  getUsageRisers,
  type FormRow,
  type PlayerSummary,
} from "@/lib/queries";
import { safeLoad } from "@/lib/safe";
import { getTrending, type TrendingEntry } from "@/lib/sleeper";
import { MARKET_CREDIT } from "@/lib/market";
import { DEFAULT_LEAGUE } from "@/lib/model";
import { getTradeValues, type ValuedPlayer, type ValueMode } from "@/lib/values";

const LOOKBACKS = [
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
];

export default async function TrendingPage({ searchParams }: { searchParams: Promise<{ hours?: string; values?: string }> }) {
  const { hours: hoursParam, values: valuesParam } = await searchParams;
  const valueMode: ValueMode = valuesParam === "dynasty" ? "dynasty" : "redraft";
  const hours = LOOKBACKS.find((l) => String(l.hours) === hoursParam)?.hours ?? 24;
  const format = await getFormat();

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    const [adds, drops, hot, cold, usage, values] = await Promise.all([
      getTrending("add", hours, 25),
      getTrending("drop", hours, 25),
      getFormMovers(ctx.season, format, "up", 12),
      getFormMovers(ctx.season, format, "down", 12),
      getUsageRisers(ctx.season, format, 10),
      getTradeValues(ctx.season, ctx.upcomingWeek, format, DEFAULT_LEAGUE, valueMode),
    ]);
    const summaries = await getPlayerSummaries([...adds, ...drops].map((t) => t.playerId), ctx.season, format);
    const flagged = (signal: "buy" | "sell") =>
      values.players
        .filter((p) => p.signal === signal)
        .sort((a, b) => Math.abs(b.gapPct ?? 0) * b.value - Math.abs(a.gapPct ?? 0) * a.value)
        .slice(0, 10);
    return {
      ctx,
      adds,
      drops,
      hot,
      cold,
      usage,
      summaries: new Map(summaries.map((s) => [s.player_id, s])),
      buys: flagged("buy"),
      sells: flagged("sell"),
      marketAvailable: values.market != null,
    };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { ctx, adds, drops, hot, cold, usage, summaries, buys, sells, marketAvailable } = result.data;
  const valueHref = (mode: ValueMode) => `/trending?${new URLSearchParams({ hours: String(hours), ...(mode === "dynasty" ? { values: mode } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Trending players"
        description={`Waiver activity across Sleeper leagues, plus who's heating up or cooling off in your ${ctx.season} data.`}
      >
        <Segmented
          items={LOOKBACKS.map((l) => ({ href: `/trending?hours=${l.hours}`, label: l.label, active: l.hours === hours }))}
        />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most added" subtitle={`Sleeper adds, last ${hours}h`}>
          <WaiverTable entries={adds} summaries={summaries} />
        </Card>
        <Card title="Most dropped" subtitle={`Sleeper drops, last ${hours}h`}>
          <WaiverTable entries={drops} summaries={summaries} />
        </Card>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 lg:col-span-2">
          <div>
            <h2 className="text-base font-semibold">Market vs. model</h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Where trade-market prices and our production model disagree most (12-team, 1QB). Market values from{" "}
              <a href={MARKET_CREDIT.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                {MARKET_CREDIT.label}
              </a>
              .
            </p>
          </div>
          <Segmented
            items={(["redraft", "dynasty"] as const).map((m) => ({ href: valueHref(m), label: m === "redraft" ? "Redraft" : "Dynasty", active: m === valueMode }))}
          />
        </div>
        <Card title="Buy low" subtitle="Our model rates them well above their market price">
          {marketAvailable ? <SignalTable rows={buys} /> : <Empty>Market values are unavailable right now.</Empty>}
        </Card>
        <Card title="Sell high" subtitle="The market pays more than their production supports">
          {marketAvailable ? <SignalTable rows={sells} /> : <Empty>Market values are unavailable right now.</Empty>}
        </Card>

        <Card title="Heating up" subtitle="Last 3 games vs. season average (min. 4 games)">
          <FormTable rows={hot} />
        </Card>
        <Card title="Cooling off" subtitle="Last 3 games vs. season average (min. 4 games)">
          <FormTable rows={cold} />
        </Card>
        <Card
          title="Usage risers"
          subtitle="Snap share, last 3 games vs. season. Role growth often shows up before the points do."
          className="lg:col-span-2"
        >
          <UsageTable rows={usage} />
        </Card>
      </div>
    </>
  );
}

function WaiverTable({ entries, summaries }: { entries: TrendingEntry[]; summaries: Map<string, PlayerSummary> }) {
  const rows = entries.filter((e) => summaries.has(e.playerId)).slice(0, 15);
  if (rows.length === 0) return <Empty>No skill-position players trending right now.</Empty>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 pb-2 font-normal">Player</th>
            <th className="pb-2 font-normal">Transactions</th>
            <th className="pb-2 text-right font-normal">Avg</th>
            <th className="px-4 pb-2 text-right font-normal">Last 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const s = summaries.get(e.playerId)!;
            return (
              <tr key={e.playerId} className="border-t border-line">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <PosBadge position={s.position} />
                    <PlayerLink id={s.player_id} name={s.name} />
                    <span className="text-xs text-muted">{s.team ?? "FA"}</span>
                    <InjuryTag status={s.injury_status} />
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-sm bg-surface-2">
                      <div className="h-2 rounded-sm bg-accent" style={{ width: `${(e.count / max) * 100}%` }} />
                    </div>
                    <span className="tabular text-xs text-ink-2">{e.count.toLocaleString()}</span>
                  </div>
                </td>
                <td className="tabular py-2 text-right">{fmt(s.avg_points)}</td>
                <td className="tabular px-4 py-2 text-right">{fmt(s.last3_avg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormTable({ rows }: { rows: FormRow[] }) {
  if (rows.length === 0) return <Empty>Not enough games played yet this season.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 pb-2 font-normal">Player</th>
            <th className="pb-2 font-normal">Weekly pts</th>
            <th className="pb-2 text-right font-normal">Avg</th>
            <th className="pb-2 text-right font-normal">Last 3</th>
            <th className="px-4 pb-2 text-right font-normal">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className="border-t border-line">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <PosBadge position={r.position} />
                  <PlayerLink id={r.player_id} name={r.name} />
                  <span className="text-xs text-muted">{r.team ?? "FA"}</span>
                </div>
              </td>
              <td className="py-2">
                <Sparkline values={r.recent} />
              </td>
              <td className="tabular py-2 text-right">{fmt(r.avg_points)}</td>
              <td className="tabular py-2 text-right">{fmt(r.last3_avg)}</td>
              <td className="px-4 py-2 text-right">
                <Delta value={r.form_delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageTable({ rows }: { rows: FormRow[] }) {
  if (rows.length === 0) return <Empty>Not enough games played yet this season.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 pb-2 font-normal">Player</th>
            <th className="pb-2 text-right font-normal">Season snap %</th>
            <th className="pb-2 text-right font-normal">Last 3 snap %</th>
            <th className="pb-2 text-right font-normal">Change</th>
            <th className="px-4 pb-2 text-right font-normal">Pts last 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className="border-t border-line">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <PosBadge position={r.position} />
                  <PlayerLink id={r.player_id} name={r.name} />
                  <span className="text-xs text-muted">{r.team ?? "FA"}</span>
                </div>
              </td>
              <td className="tabular py-2 text-right">{pct(r.avg_snap_share)}</td>
              <td className="tabular py-2 text-right">{pct(r.last3_snap_share)}</td>
              <td className="py-2 text-right">
                <Delta value={((r.last3_snap_share ?? 0) - (r.avg_snap_share ?? 0)) * 100} digits={0} suffix=" pts" />
              </td>
              <td className="tabular px-4 py-2 text-right">{fmt(r.last3_avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalTable({ rows }: { rows: ValuedPlayer[] }) {
  if (rows.length === 0) return <Empty>No big disagreements right now.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 pb-2 font-normal">Player</th>
            <th className="pb-2 text-right font-normal">Market</th>
            <th className="pb-2 text-right font-normal">Model</th>
            <th className="px-4 pb-2 text-right font-normal">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-t border-line">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <PosBadge position={r.position} />
                  <PlayerLink id={r.playerId} name={r.name} />
                  <span className="text-xs text-muted">
                    {r.team ?? "FA"}
                    {r.age ? ` · ${r.age}` : ""}
                  </span>
                </div>
              </td>
              <td className="tabular py-2 text-right">{fmt(r.market)}</td>
              <td className="tabular py-2 text-right">{fmt(r.model)}</td>
              <td className="tabular px-4 py-2 text-right text-ink-2">{Math.abs(r.gapPct ?? 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
