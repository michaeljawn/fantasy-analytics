import { blendAll, type BlendedValue } from "./blend";
import type { Format, Position } from "./formats";
import { getMarketValues, type MarketValues } from "./market";
import { getOutlooks, type LeagueSettings, type PlayerOutlook } from "./model";

// Market and model disagree about injured players for reasons that have nothing to do with value
const NO_SIGNAL_STATUSES = new Set(["Out", "IR", "PUP", "Sus"]);

export type ValueMode = "redraft" | "dynasty";

export type ValuedPlayer = {
  playerId: string;
  name: string;
  position: Position;
  team: string | null;
  age: number | null;
  injuryStatus: string | null;
  outlook: PlayerOutlook | null; // null when only the market knows the player (e.g. a rookie yet to play)
  trend30Day: number | null;
} & BlendedValue;

export async function getTradeValues(
  season: number,
  upcomingWeek: number,
  format: Format,
  league: LeagueSettings,
  mode: ValueMode,
): Promise<{ players: ValuedPlayer[]; market: MarketValues | null }> {
  const [outlooks, market] = await Promise.all([
    getOutlooks(season, upcomingWeek, format, league),
    getMarketValues({ dynasty: mode === "dynasty", superflex: league.superflex, teams: league.teams, format }),
  ]);
  return { players: valuePlayers(outlooks, market, mode), market };
}

// Redraft and dynasty values from a single outlook query (used where both are shown)
export async function getBothValues(season: number, upcomingWeek: number, format: Format, league: LeagueSettings) {
  const settings = { superflex: league.superflex, teams: league.teams, format };
  const [outlooks, redraftMarket, dynastyMarket] = await Promise.all([
    getOutlooks(season, upcomingWeek, format, league),
    getMarketValues({ ...settings, dynasty: false }),
    getMarketValues({ ...settings, dynasty: true }),
  ]);
  return {
    outlooks,
    redraft: valuePlayers(outlooks, redraftMarket, "redraft"),
    dynasty: valuePlayers(outlooks, dynastyMarket, "dynasty"),
    marketAvailable: redraftMarket != null || dynastyMarket != null,
  };
}

export function valuePlayers(outlooks: PlayerOutlook[], market: MarketValues | null, mode: ValueMode): ValuedPlayer[] {
  const modelValues = new Map(outlooks.map((o) => [o.playerId, mode === "dynasty" ? o.dynastyValue : o.value]));
  const marketValues = market ? new Map([...market.players].map(([id, p]) => [id, p.value])) : null;
  const blended = blendAll(modelValues, marketValues);
  const byId = new Map(outlooks.map((o) => [o.playerId, o]));

  const players: ValuedPlayer[] = [];
  for (const [id, b] of blended) {
    const o = byId.get(id);
    const m = market?.players.get(id);
    if (!o && !m) continue;
    players.push({
      playerId: id,
      name: o?.name ?? m!.name,
      position: (o?.position ?? m!.position) as Position,
      team: o?.team ?? m?.team ?? null,
      age: o?.age ?? m?.age ?? null,
      injuryStatus: o?.injuryStatus ?? null,
      outlook: o ?? null,
      trend30Day: m?.trend30Day ?? null,
      ...b,
      signal: NO_SIGNAL_STATUSES.has(o?.injuryStatus ?? "") ? null : b.signal,
    });
  }
  return players.sort((a, b) => b.value - a.value);
}
