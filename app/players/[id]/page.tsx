import Link from "next/link";
import { notFound } from "next/navigation";
import { ColumnChart, type Column } from "@/components/charts/ColumnChart";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, InjuryTag, PosBadge, Segmented, SignalTag, fmt, pct } from "@/components/ui";
import { getFormat } from "@/lib/format";
import { DEFAULT_LEAGUE } from "@/lib/model";
import { getBothValues, type ValuedPlayer } from "@/lib/values";
import {
  getGameLog,
  getPlayer,
  getPlayerProjections,
  getPlayerSeasons,
  getPointsAllowed,
  getSeasonContext,
  matchupLookup,
} from "@/lib/queries";
import { safeLoad } from "@/lib/safe";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  const format = await getFormat();

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    const [player, log, seasons, projections, values, allowed] = await Promise.all([
      getPlayer(id),
      getGameLog(id, format),
      getPlayerSeasons(id, format),
      getPlayerProjections(id, ctx.season, format),
      getBothValues(ctx.season, ctx.upcomingWeek, format, DEFAULT_LEAGUE),
      getPointsAllowed(ctx, format),
    ]);
    return {
      ctx,
      player,
      log,
      seasons,
      projections,
      outlook: values.outlooks.find((o) => o.playerId === id),
      redraftValue: values.redraft.find((v) => v.playerId === id),
      dynastyValue: values.dynasty.find((v) => v.playerId === id),
      allowed,
    };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { ctx, player, log, seasons, projections, outlook, redraftValue, dynastyValue, allowed } = result.data;
  if (!player) notFound();

  const seasonList = seasons.map((s) => s.season);
  const season = seasonList.includes(Number(seasonParam)) ? Number(seasonParam) : (seasonList[0] ?? ctx.season);
  const summary = seasons.find((s) => s.season === season);
  const games = log.filter((g) => g.season === season);

  const upcoming = season === ctx.season ? projections.filter((p) => p.week > (games.at(-1)?.week ?? 0)) : [];
  const columns: Column[] = [
    ...games.map((g) => ({
      key: `g${g.week}`,
      label: String(g.week),
      value: g.points,
      tooltip: {
        title: `Week ${g.week} ${g.opponent ? `vs ${g.opponent}` : ""}`,
        lines: [`${g.points.toFixed(1)} pts · ${player.position}${g.pos_rank}`, statLine(player.position, g)],
      },
    })),
    ...upcoming.map((p) => ({
      key: `p${p.week}`,
      label: String(p.week),
      value: p.points,
      projected: true,
      tooltip: { title: `Week ${p.week} ${p.opponent ? `vs ${p.opponent}` : ""}`, lines: [`Projected ${p.points.toFixed(1)} pts`] },
    })),
  ];

  const matchup = matchupLookup(allowed.rows)(outlook?.nextOpponent ?? null, player.position);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <PlayerAvatar id={player.player_id} name={`${player.first_name} ${player.last_name}`} size={72} />
          <div>
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <PosBadge position={player.position} />
              <span>{player.team ?? "Free agent"}</span>
              {player.age && <span>· Age {player.age}</span>}
              {player.years_exp != null && <span>· {player.years_exp === 0 ? "Rookie" : `Year ${player.years_exp + 1}`}</span>}
              <InjuryTag status={player.injury_status} />
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {player.first_name} {player.last_name}
            </h1>
          </div>
        </div>
        {seasonList.length > 1 && (
          <Segmented
            items={[...seasonList].reverse().map((s) => ({ href: `/players/${id}?season=${s}`, label: String(s), active: s === season }))}
          />
        )}
      </div>

      {outlook && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Rest-of-season proj/G" value={fmt(outlook.outlook * outlook.availability)} note={`${player.position}${outlook.posRank}`} />
          <ValueStat label="Redraft value" v={redraftValue} />
          <ValueStat label="Dynasty value" v={dynastyValue} />
          <Stat
            label={`Week ${ctx.upcomingWeek} projection`}
            value={fmt(outlook.projNext)}
            note={outlook.nextOpponent ? `vs ${outlook.nextOpponent}` : "No game / bye"}
          />
          <Stat
            label="Matchup"
            value={matchup ? matchupLabel(matchup.matchup_factor) : "–"}
            note={matchup ? `${outlook.nextOpponent} allows ${fmt(matchup.points_allowed_pg)} to ${player.position}s (avg ${fmt(matchup.league_avg_pg)})` : undefined}
          />
        </div>
      )}

      <Card
        title={`${season} weekly points`}
        subtitle={upcoming.length ? "Solid = actual · Light = Sleeper projection" : undefined}
        className="mb-4"
      >
        {columns.length ? (
          <ColumnChart
            data={columns}
            ariaLabel={`${player.first_name} ${player.last_name} fantasy points by week, ${season}`}
            reference={summary ? { value: summary.avg_points, label: `Avg ${summary.avg_points.toFixed(1)}` } : undefined}
          />
        ) : (
          <p className="text-sm text-muted">No games played in {season}.</p>
        )}
      </Card>

      {summary && (
        <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">
          <Stat label="Avg" value={fmt(summary.avg_points)} small />
          <Stat label="Floor (20th pct)" value={fmt(summary.floor_points)} small />
          <Stat label="Ceiling (80th pct)" value={fmt(summary.ceiling_points)} small />
          <Stat label="Boom rate" value={pct(summary.boom_rate)} small />
          <Stat label="Bust rate" value={pct(summary.bust_rate)} small />
          <Stat label="Snap share" value={pct(summary.avg_snap_share)} small />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title={`${season} game log`}>
          <GameLog position={player.position} games={games} />
        </Card>
        <Card title="Season by season">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-normal">Season</th>
                <th className="pb-2 text-right font-normal">GP</th>
                <th className="pb-2 text-right font-normal">Avg</th>
                <th className="pb-2 text-right font-normal">Total</th>
                <th className="pb-2 text-right font-normal">Boom</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.season} className="border-t border-line">
                  <td className="py-2">
                    <Link href={`/players/${id}?season=${s.season}`} className="hover:text-accent hover:underline">
                      {s.season}
                    </Link>
                  </td>
                  <td className="tabular py-2 text-right">{s.games}</td>
                  <td className="tabular py-2 text-right">{fmt(s.avg_points)}</td>
                  <td className="tabular py-2 text-right">{fmt(s.total_points)}</td>
                  <td className="tabular py-2 text-right">{pct(s.boom_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function ValueStat({ label, v }: { label: string; v: ValuedPlayer | undefined }) {
  const parts = [v?.market != null && `Market ${fmt(v.market)}`, v?.model != null && `Model ${fmt(v.model)}`].filter(Boolean);
  return (
    <Stat
      label={label}
      value={fmt(v?.value)}
      note={
        <span className="flex flex-wrap items-center gap-1.5">
          {parts.join(" · ") || "0–100 scale"}
          <SignalTag signal={v?.signal} market={v?.market} model={v?.model} />
        </span>
      }
    />
  );
}

function Stat({ label, value, note, small }: { label: string; value: string; note?: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-semibold ${small ? "text-lg" : "text-2xl"}`}>{value}</div>
      {note && <div className="mt-0.5 text-xs text-ink-2">{note}</div>}
    </div>
  );
}

function matchupLabel(factor: number) {
  if (factor >= 1.15) return "Great";
  if (factor >= 1.05) return "Good";
  if (factor > 0.95) return "Neutral";
  if (factor > 0.85) return "Tough";
  return "Very tough";
}

type LogGame = Awaited<ReturnType<typeof getGameLog>>[number];

function statLine(position: string, g: LogGame) {
  const parts: string[] = [];
  if (position === "QB") parts.push(`${g.passing_yds} pass yd, ${g.passing_tds} TD, ${g.interceptions} INT`);
  if (g.rush_att) parts.push(`${g.rush_att}-${g.rushing_yds} rush${g.rushing_tds ? `, ${g.rushing_tds} TD` : ""}`);
  if (g.targets) parts.push(`${g.receptions}/${g.targets}, ${g.receiving_yds} yd${g.receiving_tds ? `, ${g.receiving_tds} TD` : ""}`);
  return parts.join(" · ");
}

function GameLog({ position, games }: { position: string; games: LogGame[] }) {
  if (games.length === 0) return <p className="text-sm text-muted">No games.</p>;
  const qb = position === "QB";
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 pb-2 font-normal">Wk</th>
            <th className="pb-2 font-normal">Opp</th>
            <th className="pb-2 text-right font-normal">Pts</th>
            <th className="pb-2 text-right font-normal">Rank</th>
            {qb && <th className="pb-2 text-right font-normal">Pass</th>}
            <th className="pb-2 text-right font-normal">Rush</th>
            {!qb && <th className="pb-2 text-right font-normal">Rec</th>}
            <th className="px-4 pb-2 text-right font-normal">Snap %</th>
          </tr>
        </thead>
        <tbody>
          {[...games].reverse().map((g) => (
            <tr key={g.week} className="border-t border-line">
              <td className="tabular px-4 py-2 text-muted">{g.week}</td>
              <td className="py-2">{g.opponent ?? "–"}</td>
              <td className="tabular py-2 text-right font-medium">{g.points.toFixed(1)}</td>
              <td className="tabular py-2 text-right text-ink-2">
                {position}
                {g.pos_rank}
              </td>
              {qb && (
                <td className="tabular py-2 text-right text-ink-2">
                  {g.passing_yds} / {g.passing_tds} TD / {g.interceptions} INT
                </td>
              )}
              <td className="tabular py-2 text-right text-ink-2">
                {g.rush_att ? `${g.rush_att}-${g.rushing_yds}${g.rushing_tds ? ` · ${g.rushing_tds} TD` : ""}` : "–"}
              </td>
              {!qb && (
                <td className="tabular py-2 text-right text-ink-2">
                  {g.receptions}/{g.targets}-{g.receiving_yds}
                  {g.receiving_tds ? ` · ${g.receiving_tds} TD` : ""}
                </td>
              )}
              <td className="tabular px-4 py-2 text-right text-ink-2">{pct(g.snap_share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
