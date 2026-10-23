// Market trade values from FantasyCalc (https://fantasycalc.com), derived from real fantasy trades.
// Fetched at most once a day per league setting via Next's fetch cache.

import type { Format } from "./formats";

const FANTASYCALC_URL = "https://api.fantasycalc.com/values/current";
const ONE_DAY = 60 * 60 * 24;

export type MarketSettings = {
  dynasty: boolean;
  superflex: boolean;
  teams: number;
  format: Format;
};

export type MarketPlayer = {
  playerId: string; // Sleeper id
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number; // 0–100, top asset = 100
  trend30Day: number; // 0–100 scale change over 30 days
  rank: number;
};

export type MarketPick = { name: string; value: number };

export type MarketValues = {
  players: Map<string, MarketPlayer>;
  picks: Map<string, number>; // keyed like our pick ids: pick-2027-1-early
  fetchedAt: Date;
};

type FantasyCalcEntry = {
  player: {
    name: string;
    sleeperId: string | null;
    position: string;
    maybeTeam: string | null;
    maybeAge: number | null;
  };
  value: number;
  trend30Day: number;
  overallRank: number;
};

const ROUND_NAMES: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };

export async function getMarketValues(settings: MarketSettings): Promise<MarketValues | null> {
  const params = new URLSearchParams({
    isDynasty: String(settings.dynasty),
    numQbs: settings.superflex ? "2" : "1",
    numTeams: String(settings.teams),
    ppr: settings.format === "ppr" ? "1" : settings.format === "half" ? "0.5" : "0",
  });

  let entries: FantasyCalcEntry[];
  try {
    const res = await fetch(`${FANTASYCALC_URL}?${params}`, { next: { revalidate: ONE_DAY } });
    if (!res.ok) return null;
    entries = await res.json();
    if (!Array.isArray(entries) || entries.length === 0) return null;
  } catch {
    return null;
  }

  const top = Math.max(...entries.map((e) => e.value));
  const scale = (v: number) => Math.round((1000 * v) / top) / 10;

  const players = new Map<string, MarketPlayer>();
  const rawPicks = new Map<string, number>(); // "2027-1-early" | "2028-1" → scaled value
  for (const e of entries) {
    if (e.player.position === "PICK") {
      // "2027 1st (Early)" or "2028 1st"
      const m = e.player.name.match(/^(\d{4}) (1st|2nd|3rd|4th)(?: \((Early|Mid|Late)\))?$/);
      if (m) rawPicks.set([m[1], ROUND_NAMES[m[2]], m[3]?.toLowerCase()].filter(Boolean).join("-"), scale(e.value));
    } else if (e.player.sleeperId) {
      players.set(e.player.sleeperId, {
        playerId: e.player.sleeperId,
        name: e.player.name,
        position: e.player.position,
        team: e.player.maybeTeam,
        age: e.player.maybeAge == null ? null : Math.floor(e.player.maybeAge),
        value: scale(e.value),
        trend30Day: scale(e.trend30Day),
        rank: e.overallRank,
      });
    }
  }

  return { players, picks: expandPicks(rawPicks), fetchedAt: new Date() };
}

// FantasyCalc splits only the next draft into Early/Mid/Late. For later drafts it lists one value per
// round, so we apply the next draft's Early:generic and Late:generic ratios to fill in the slots.
function expandPicks(raw: Map<string, number>): Map<string, number> {
  const picks = new Map<string, number>();
  const years = [...new Set([...raw.keys()].map((k) => k.split("-")[0]))].sort();
  const [firstYear] = years;

  for (const year of years) {
    for (let round = 1; round <= 4; round++) {
      const generic = raw.get(`${year}-${round}`);
      for (const slot of ["early", "mid", "late"]) {
        const direct = raw.get(`${year}-${round}-${slot}`);
        const refSlot = raw.get(`${firstYear}-${round}-${slot}`);
        const refGeneric = raw.get(`${firstYear}-${round}`);
        const value = direct ?? (generic && refSlot && refGeneric ? (generic * refSlot) / refGeneric : generic);
        if (value != null) picks.set(`pick-${year}-${round}-${slot}`, Math.round(value * 10) / 10);
      }
    }
  }
  return picks;
}

export const MARKET_CREDIT = { label: "FantasyCalc", url: "https://fantasycalc.com" };
