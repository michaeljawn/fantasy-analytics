import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, InjuryTag, PageHeader, PlayerLink, PosBadge, Segmented, SignalTag, fmt, pct } from "@/components/ui";
import { getFormat, POSITIONS, type Format, type Position } from "@/lib/format";
import { DEFAULT_LEAGUE } from "@/lib/model";
import { getSeasonContext, getSeasonRankings, type SeasonRow } from "@/lib/queries";
import { safeLoad } from "@/lib/safe";
import { assignTiers } from "@/lib/tiers";
import { getTradeValues } from "@/lib/values";

type Params = { view?: string; season?: string; pos?: string; sort?: string };

const SEASON_SORTS: Record<string, { label: string; get: (r: SeasonRow) => number | null; asc?: boolean }> = {
  total: { label: "Total", get: (r) => r.total_points },
  avg: { label: "Avg", get: (r) => r.avg_points },
  last3: { label: "Last 3", get: (r) => r.last3_avg },
  floor: { label: "Floor", get: (r) => r.floor_points },
  ceiling: { label: "Ceiling", get: (r) => r.ceiling_points },
  boom: { label: "Boom %", get: (r) => r.boom_rate },
  bust: { label: "Bust %", get: (r) => r.bust_rate, asc: true },
  snap: { label: "Snap %", get: (r) => r.avg_snap_share },
};

const REPLACEMENT_RANK: Record<Position, number> = { QB: 12, RB: 30, WR: 36, TE: 15 };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const format = await getFormat();
  const view = params.view === "season" ? "season" : "ros";
  const pos = (POSITIONS as readonly string[]).includes(params.pos ?? "") ? (params.pos as Position) : "ALL";

  const ctxResult = await safeLoad(getSeasonContext);
  if (!ctxResult.data) return <SetupNotice error={ctxResult.error} />;
  const ctx = ctxResult.data;
  const season = ctx.seasons.includes(Number(params.season)) ? Number(params.season) : ctx.season;

  const href = (next: Partial<Params>) => {
    const merged = { view, season: String(season), pos, sort: params.sort, ...next };
    const qs = Object.entries(merged).filter(([, v]) => v && v !== "ALL") as [string, string][];
    return `/rankings?${new URLSearchParams(qs)}`;
  };

  return (
    <>
      <PageHeader
        title="Rankings"
        description={
          view === "ros"
            ? `Rest-of-season outlook: projected points per game blending Sleeper projections, ${ctx.season} form, and last season. Tiers break at unusually large drop-offs. Trade value blends market and model values (12-team, 1QB).`
            : `What actually happened in ${season}. Boom = top-12 weekly finish (top-24 for RB/WR); bust = outside top-24 (top-36 for RB/WR).`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Segmented
          items={[
            { href: href({ view: "ros", sort: undefined }), label: "Rest of season", active: view === "ros" },
            { href: href({ view: "season", sort: undefined }), label: "Season stats", active: view === "season" },
          ]}
        />
        <Segmented
          items={["ALL", ...POSITIONS].map((p) => ({ href: href({ pos: p }), label: p === "ALL" ? "All" : p, active: pos === p }))}
        />
        {view === "season" && (
          <Segmented
            items={[...ctx.seasons].reverse().map((s) => ({ href: href({ season: String(s) }), label: String(s), active: s === season }))}
          />
        )}
      </div>

      <Card>
        {view === "ros" ? (
          <RosTable season={ctx.season} upcomingWeek={ctx.upcomingWeek} format={format} pos={pos} />
        ) : (
          <SeasonTable season={season} format={format} pos={pos} sort={params.sort ?? "total"} href={href} />
        )}
      </Card>
    </>
  );
}

async function RosTable({ season, upcomingWeek, format, pos }: { season: number; upcomingWeek: number; format: Format; pos: Position | "ALL" }) {
  const { players: valued } = await getTradeValues(season, upcomingWeek, format, DEFAULT_LEAGUE, "redraft");
  const all = valued.flatMap((v) => (v.outlook ? [v.outlook] : []));
  const values = new Map(valued.map((v) => [v.playerId, v]));
  const rows = all
    .filter((p) => pos === "ALL" || p.position === pos)
    .sort((a, b) => b.outlook * b.availability - a.outlook * a.availability)
    .slice(0, pos === "ALL" ? 150 : 80);
  const tiers = pos === "ALL" ? null : assignTiers(rows.map((r) => r.outlook * r.availability));

  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-normal">#</th>
            <th className="py-3 font-normal">Player</th>
            <th className="py-3 text-right font-normal">Proj/G</th>
            <th className="py-3 text-right font-normal">Wk {upcomingWeek}</th>
            <th className="py-3 font-normal pl-4">Opp</th>
            <th className="py-3 text-right font-normal">{season} avg</th>
            <th className="py-3 text-right font-normal">Last 3</th>
            <th className="py-3 text-right font-normal">VOR/G</th>
            <th className="px-4 py-3 text-right font-normal">Trade value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TierRow key={r.playerId} tier={tiers?.[i]} prevTier={tiers?.[i - 1]} cols={9}>
              <td className="tabular px-4 py-2 text-muted">{pos === "ALL" ? i + 1 : `${pos}${i + 1}`}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <PosBadge position={r.position} />
                  <PlayerLink id={r.playerId} name={r.name} />
                  <span className="text-xs text-muted">{r.team ?? "FA"}</span>
                  <InjuryTag status={r.injuryStatus} />
                  <SignalTag signal={values.get(r.playerId)?.signal} market={values.get(r.playerId)?.market} model={values.get(r.playerId)?.model} />
                </div>
              </td>
              <td className="tabular py-2 text-right font-medium">{fmt(r.outlook * r.availability)}</td>
              <td className="tabular py-2 text-right">{fmt(r.projNext)}</td>
              <td className="py-2 pl-4 text-ink-2">{r.nextOpponent ?? (r.projNext == null ? "–" : "")}</td>
              <td className="tabular py-2 text-right">{fmt(r.seasonAvg)}</td>
              <td className="tabular py-2 text-right">{fmt(r.last3Avg)}</td>
              <td className={`tabular py-2 text-right ${r.vor >= 0 ? "" : "text-muted"}`}>{fmt(r.vor)}</td>
              <td className="tabular px-4 py-2 text-right" title={values.get(r.playerId)?.market != null ? `Market ${fmt(values.get(r.playerId)?.market)} · Model ${fmt(values.get(r.playerId)?.model)}` : "Model only"}>
                {fmt(values.get(r.playerId)?.value ?? r.value)}
              </td>
            </TierRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function SeasonTable({
  season,
  format,
  pos,
  sort,
  href,
}: {
  season: number;
  format: Format;
  pos: Position | "ALL";
  sort: string;
  href: (p: Partial<Params>) => string;
}) {
  const all = await getSeasonRankings(season, format, pos);

  // Replacement level per position, by total points (avg of the Nth-ranked player)
  const replacement = new Map<string, number>();
  for (const p of POSITIONS) {
    const group = all.filter((r) => r.position === p);
    const r = group[Math.min(REPLACEMENT_RANK[p], group.length) - 1];
    if (r) replacement.set(p, r.avg_points);
  }

  const sorter = SEASON_SORTS[sort] ?? SEASON_SORTS.total;
  const rows = all
    .filter((r) => (sort === "total" ? true : r.games >= 4))
    .sort((a, b) => {
      const av = sorter.get(a) ?? -Infinity;
      const bv = sorter.get(b) ?? -Infinity;
      return sorter.asc ? av - bv : bv - av;
    })
    .slice(0, pos === "ALL" ? 150 : 80);

  const tiers = pos !== "ALL" && sort === "total" ? assignTiers(rows.map((r) => r.total_points)) : null;
  const th = (key: string) => (
    <th className="py-3 text-right font-normal">
      <Link href={href({ sort: key })} className={key === sort ? "font-medium text-ink" : "hover:text-ink"}>
        {SEASON_SORTS[key].label}
        {key === sort ? (SEASON_SORTS[key].asc ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );

  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-normal">#</th>
            <th className="py-3 font-normal">Player</th>
            <th className="py-3 text-right font-normal">GP</th>
            {th("total")}
            {th("avg")}
            <th className="py-3 text-right font-normal">VOR/G</th>
            {th("last3")}
            {th("floor")}
            {th("ceiling")}
            {th("boom")}
            {th("bust")}
            <th className="px-4 py-3 text-right font-normal">
              <Link href={href({ sort: "snap" })} className={sort === "snap" ? "font-medium text-ink" : "hover:text-ink"}>
                Snap %{sort === "snap" ? " ↓" : ""}
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const repl = replacement.get(r.position);
            return (
              <TierRow key={r.player_id} tier={tiers?.[i]} prevTier={tiers?.[i - 1]} cols={12}>
                <td className="tabular px-4 py-2 text-muted">{i + 1}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <PosBadge position={r.position} />
                    <PlayerLink id={r.player_id} name={r.name} />
                    <span className="text-xs text-muted">{r.team ?? "FA"}</span>
                  </div>
                </td>
                <td className="tabular py-2 text-right text-ink-2">{r.games}</td>
                <td className="tabular py-2 text-right font-medium">{fmt(r.total_points)}</td>
                <td className="tabular py-2 text-right">{fmt(r.avg_points)}</td>
                <td className="tabular py-2 text-right">{repl == null ? "–" : fmt(r.avg_points - repl)}</td>
                <td className="tabular py-2 text-right">{fmt(r.last3_avg)}</td>
                <td className="tabular py-2 text-right">{fmt(r.floor_points)}</td>
                <td className="tabular py-2 text-right">{fmt(r.ceiling_points)}</td>
                <td className="tabular py-2 text-right">{pct(r.boom_rate)}</td>
                <td className="tabular py-2 text-right">{pct(r.bust_rate)}</td>
                <td className="tabular px-4 py-2 text-right">{pct(r.avg_snap_share)}</td>
              </TierRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TierRow({ tier, prevTier, cols, children }: { tier?: number; prevTier?: number; cols: number; children: React.ReactNode }) {
  const newTier = tier != null && tier !== prevTier;
  return (
    <>
      {newTier && (
        <tr>
          <td colSpan={cols} className="bg-surface-2 px-4 py-1 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
            Tier {tier}
          </td>
        </tr>
      )}
      <tr className={newTier ? "" : "border-t border-line"}>{children}</tr>
    </>
  );
}
