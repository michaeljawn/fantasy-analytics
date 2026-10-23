import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, PageHeader } from "@/components/ui";
import { getFormat, POSITIONS, type Position } from "@/lib/format";
import { getPointsAllowed, getSeasonContext, type MatchupRow } from "@/lib/queries";
import { safeLoad } from "@/lib/safe";

// Diverging fill: blue arm = soft (allows more than average), red arm = tough, neutral gray at average
function cellColor(factor: number) {
  const strength = Math.min(Math.abs(factor - 1) / 0.35, 1) * 55;
  const pole = factor >= 1 ? "var(--series-1)" : "var(--critical)";
  return `color-mix(in oklab, ${pole} ${strength.toFixed(0)}%, var(--surface-2))`;
}

export default async function MatchupsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const format = await getFormat();
  const sortPos: Position = (POSITIONS as readonly string[]).includes(sort ?? "") ? (sort as Position) : "WR";

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    return { ctx, allowed: await getPointsAllowed(ctx, format) };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { allowed } = result.data;

  const byDefense = new Map<string, Partial<Record<Position, MatchupRow>>>();
  for (const r of allowed.rows) {
    const entry = byDefense.get(r.defense) ?? {};
    entry[r.position] = r;
    byDefense.set(r.defense, entry);
  }
  const defenses = [...byDefense.entries()].sort(
    ([, a], [, b]) => (b[sortPos]?.points_allowed_pg ?? 0) - (a[sortPos]?.points_allowed_pg ?? 0),
  );

  return (
    <>
      <PageHeader
        title="Matchups"
        description={`Fantasy points each defense allows per game to each position (${allowed.season}). Blue = softer than league average, red = tougher. Sort by a position to find the best streaming matchups.`}
      />
      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 text-left font-normal">Defense</th>
                {POSITIONS.map((p) => (
                  <th key={p} className="px-1 py-3 text-center font-normal">
                    <Link href={`/matchups?sort=${p}`} className={p === sortPos ? "font-semibold text-ink" : "hover:text-ink"}>
                      vs {p}
                      {p === sortPos ? " ↓" : ""}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {defenses.map(([defense, cells]) => (
                <tr key={defense}>
                  <td className="px-4 py-0.5 font-medium">{defense}</td>
                  {POSITIONS.map((p) => {
                    const c = cells[p];
                    return (
                      <td key={p} className="p-0.5">
                        {c ? (
                          <div
                            title={`${defense} allows ${c.points_allowed_pg} pts/game to ${p}s · league avg ${c.league_avg_pg} · ${c.softness_rank} softest of 32`}
                            className="tabular rounded px-2 py-1.5 text-center"
                            style={{ background: cellColor(c.matchup_factor) }}
                          >
                            {c.points_allowed_pg.toFixed(1)}
                            <span className="ml-1.5 text-[11px] text-ink-2">
                              {c.matchup_factor >= 1 ? "+" : ""}
                              {Math.round((c.matchup_factor - 1) * 100)}%
                            </span>
                          </div>
                        ) : (
                          <div className="text-center text-muted">–</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
