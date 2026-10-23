import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader } from "@/components/ui";
import { BLEND_WEIGHTS } from "@/lib/blend";
import { getFormat } from "@/lib/format";
import { MARKET_CREDIT } from "@/lib/market";
import { buildPicks } from "@/lib/picks";
import { getSeasonContext } from "@/lib/queries";
import { safeLoad } from "@/lib/safe";
import { getTradeValues } from "@/lib/values";
import { TradeCalculator, type TradeAsset } from "./TradeCalculator";

const MODEL_DESCRIPTIONS = {
  redraft: "our model's rest-of-season points per game above a waiver-level player",
  dynasty:
    "our model's production edge carried forward five seasons along position-specific age curves (RBs decline from 26, WRs from 28, TEs from 29, QBs from 33)",
};

export default async function TradePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const format = await getFormat();
  const teams = [8, 10, 12, 14, 16].includes(Number(params.teams)) ? Number(params.teams) : 12;
  const superflex = params.sf === "1";
  const mode = params.mode === "dynasty" ? "dynasty" : "redraft";

  const result = await safeLoad(async () => {
    const ctx = await getSeasonContext();
    const values = await getTradeValues(ctx.season, ctx.upcomingWeek, format, { teams, superflex }, mode);
    return { ctx, ...values };
  });
  if (!result.data) return <SetupNotice error={result.error} />;
  const { ctx, players: valued, market } = result.data;

  const players: TradeAsset[] = valued
    .filter((p) => p.value > 0 || (p.outlook?.games ?? 0) > 0)
    .map((p) => ({
      kind: "player" as const,
      id: p.playerId,
      name: p.name,
      position: p.position,
      team: p.team,
      injury: p.injuryStatus,
      age: p.age,
      value: p.value,
      market: p.market,
      model: p.model,
      signal: p.signal,
      outlook: p.outlook ? Math.round(p.outlook.outlook * p.outlook.availability * 10) / 10 : undefined,
      posRank: p.outlook?.posRank,
    }));

  // Market pick values when FantasyCalc has them, otherwise our own pick table. The next rookie draft follows this season.
  const picks: TradeAsset[] =
    mode === "dynasty"
      ? buildPicks(ctx.season + 1, superflex).map((p) => ({
          kind: "pick" as const,
          id: p.id,
          name: p.name,
          position: "PK",
          team: null,
          injury: null,
          value: market?.picks.get(p.id) ?? p.value,
          market: market?.picks.get(p.id) ?? null,
          model: null,
          signal: null,
        }))
      : [];

  const pct = (w: number) => `${Math.round(w * 100)}%`;

  return (
    <>
      <PageHeader
        title="Trade calculator"
        description={`Trade value blends ${pct(BLEND_WEIGHTS.market)} market value from real trades with ${pct(BLEND_WEIGHTS.model)} ${MODEL_DESCRIPTIONS[mode]}. Sell-high and buy-low tags mark players where the two disagree. Packages are discounted: the second piece counts 80%, the third 65%, and so on.`}
      />
      <TradeCalculator
        assets={[...players, ...picks]}
        mode={mode}
        teams={teams}
        superflex={superflex}
        initialA={params.a?.split(",").filter(Boolean) ?? []}
        initialB={params.b?.split(",").filter(Boolean) ?? []}
      />
      <p className="mt-6 text-xs text-muted">
        {market ? (
          <>
            Market values from{" "}
            <a href={MARKET_CREDIT.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
              {MARKET_CREDIT.label}
            </a>
            , refreshed daily.
          </>
        ) : (
          "Market values are unavailable right now, so these are model-only values."
        )}
      </p>
    </>
  );
}
