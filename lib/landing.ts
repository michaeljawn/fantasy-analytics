import { query } from "./db";
import type { Format } from "./formats";
import { DEFAULT_LEAGUE } from "./model";
import { buildPicks } from "./picks";
import { getFormMovers, getPlayerSummaries, getSeasonContext } from "./queries";
import { getTrending } from "./sleeper";
import { evaluateTrade } from "./trade";
import { getTradeValues, type ValuedPlayer } from "./values";

export type LandingData = {
  season: number;
  week: number;
  counts: { playerGames: number; seasons: number; players: number; marketValues: number };
  hotPlayer: { id: string; name: string; position: string; team: string | null; points: number[]; weeks: number[]; delta: number } | null;
  trending: { id: string; name: string; position: string; team: string | null; adds: number }[];
  buyLow: ValuedPlayer | null;
  sellHigh: ValuedPlayer | null;
  trade: {
    a: { name: string; value: number; id?: string }[];
    b: { name: string; value: number; id?: string }[];
    sideA: number;
    sideB: number;
    label: string;
  } | null;
};

export async function getLandingData(format: Format): Promise<LandingData> {
  const ctx = await getSeasonContext();
  const [countRows, hot, adds, dynasty] = await Promise.all([
    query<{ player_games: number; seasons: number; players: number }>(
      `SELECT (SELECT COUNT(*) FROM weekly_stats) AS player_games,
			(SELECT COUNT(DISTINCT season) FROM weekly_stats) AS seasons,
			(SELECT COUNT(DISTINCT player_id) FROM weekly_stats) AS players`,
    ),
    getFormMovers(ctx.season, format, "up", 1),
    getTrending("add", 24, 30),
    getTradeValues(ctx.season, ctx.upcomingWeek, format, DEFAULT_LEAGUE, "dynasty"),
  ]);

  const summaries = await getPlayerSummaries(adds.map((a) => a.playerId), ctx.season, format);
  const byId = new Map(summaries.map((s) => [s.player_id, s]));
  const trending = adds
    .filter((a) => byId.has(a.playerId))
    .slice(0, 16)
    .map((a) => {
      const s = byId.get(a.playerId)!;
      return { id: a.playerId, name: s.name, position: s.position, team: s.team, adds: a.count };
    });

  // Biggest market-vs-model disagreement among players people actually care about
  const spotlight = (signal: "buy" | "sell") =>
    dynasty.players
      .filter((p) => p.signal === signal && p.value >= 15)
      .sort((x, y) => Math.abs(y.gapPct ?? 0) - Math.abs(x.gapPct ?? 0))[0] ?? null;

  // A real dynasty trade: the #1 asset for the #8 player plus the next draft's early 1st
  let trade: LandingData["trade"] = null;
  const [star, , , , , , , second] = dynasty.players;
  const pickId = `pick-${ctx.season + 1}-1-early`;
  const pick = buildPicks(ctx.season + 1, false).find((p) => p.id === pickId);
  if (star && second && pick) {
    const pickValue = dynasty.market?.picks.get(pickId) ?? pick.value;
    const verdict = evaluateTrade([star.value], [second.value, pickValue]);
    trade = {
      a: [{ name: star.name, value: star.value, id: star.playerId }],
      b: [
        { name: second.name, value: second.value, id: second.playerId },
        { name: pick.name, value: pickValue },
      ],
      sideA: verdict.sideA,
      sideB: verdict.sideB,
      label: verdict.favored == null ? "Fair trade" : `${verdict.label}: Team ${verdict.favored}`,
    };
  }

  const h = hot[0];
  return {
    season: ctx.season,
    week: ctx.upcomingWeek,
    counts: {
      playerGames: countRows[0]?.player_games ?? 0,
      seasons: countRows[0]?.seasons ?? 0,
      players: countRows[0]?.players ?? 0,
      marketValues: dynasty.market?.players.size ?? 0,
    },
    hotPlayer: h
      ? { id: h.player_id, name: h.name, position: h.position, team: h.team, points: h.recent.map(Number), weeks: h.recent_weeks, delta: h.form_delta }
      : null,
    trending,
    buyLow: spotlight("buy"),
    sellHigh: spotlight("sell"),
    trade,
  };
}
