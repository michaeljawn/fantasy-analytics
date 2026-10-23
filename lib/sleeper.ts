// Live Sleeper API data (cached by Next's fetch cache)

const SLEEPER_V1 = "https://api.sleeper.app/v1";

export type NflState = {
  season: number;
  week: number;
  seasonType: string;
};

export async function getNflState(): Promise<NflState> {
  try {
    const res = await fetch(`${SLEEPER_V1}/state/nfl`, { next: { revalidate: 3600 } });
    const s = await res.json();
    return { season: Number(s.season), week: Number(s.week), seasonType: s.season_type };
  } catch {
    return { season: new Date().getFullYear(), week: 1, seasonType: "regular" };
  }
}

export type TrendingEntry = { playerId: string; count: number };

export async function getTrending(type: "add" | "drop", lookbackHours = 24, limit = 50): Promise<TrendingEntry[]> {
  try {
    const res = await fetch(
      `${SLEEPER_V1}/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`,
      { next: { revalidate: 900 } },
    );
    const rows: { player_id: string; count: number }[] = await res.json();
    return rows.map((r) => ({ playerId: r.player_id, count: r.count }));
  } catch {
    return [];
  }
}
