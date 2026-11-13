// League power rankings: how good each team is built to be, blended with how it has played.
//
//   Lineup     best possible starting lineup, in projected points per game (model outlooks)
//   Value      total trade value of the roster (dynasty value in dynasty leagues) plus owned picks
//   Results    all-play win rate and points per game, which count for more as the season goes on
//
// Kickers, defenses, and IDP slots aren't modeled yet (#17), so lineups cover QB/RB/WR/TE slots only.

import { query } from "./db";
import type { Format, Position } from "./formats";
import { getTeams, type LeagueInfo, type Team } from "./league";
import type { LeagueSettings } from "./model";
import { buildPicks, PICK_ROUNDS, type PickSlot } from "./picks";
import { getSeasonContext } from "./queries";
import { getTradeValues } from "./values";

const SKILL: Position[] = ["QB", "RB", "WR", "TE"];

// Which positions can fill each starting slot. Anything else (K, DEF, IDP) is skipped.
const SLOT_ELIGIBILITY: Record<string, Position[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

// Results count for nothing before week 1 and half the score from week 8 on
const RESULTS_FULL_WEIGHT_GAMES = 8;
const RESULTS_MAX_WEIGHT = 0.5;

export type PowerPlayer = { playerId: string; name: string; position: Position; team: string | null; ppg: number; value: number };

export type PowerTeam = {
  team: Team;
  rank: number;
  score: number; // 0–100 within the league
  lineupPpg: number;
  lineupRank: number;
  lineup: PowerPlayer[];
  rosterValue: number;
  pickValue: number;
  valueRank: number;
  positionRanks: Record<Position, number>;
  allPlayPct: number | null;
  pointsPerGame: number | null;
  standingRank: number;
  label: string;
  core: PowerPlayer[]; // most valuable players
};

export type PowerRankings = {
  teams: PowerTeam[];
  dynasty: boolean;
  gamesPlayed: number;
  resultsWeight: number;
  format: Format;
};

export function leagueFormat(scoring: Record<string, number>): Format {
  const rec = scoring.rec ?? 0;
  return rec >= 1 ? "ppr" : rec > 0 ? "half" : "std";
}

export async function getPowerRankings(league: LeagueInfo): Promise<PowerRankings> {
  const leagueId = league.league_id;
  const dynasty = league.settings.type === 2 || league.settings.type === 1;
  const format = leagueFormat(league.scoring_settings);
  const settings: LeagueSettings = {
    teams: league.total_rosters,
    superflex: league.roster_positions.includes("SUPER_FLEX") || league.roster_positions.filter((p) => p === "QB").length > 1,
  };

  const ctx = await getSeasonContext();
  const [teams, rosters, results, tradedPicks, valued] = await Promise.all([
    getTeams(leagueId),
    query<{ roster_id: number; player_id: string; slot: string }>(
      `SELECT roster_id, player_id, slot FROM league_roster_players WHERE league_id = $1`,
      [leagueId],
    ),
    getResults(leagueId, Math.min(league.lastScoredWeek, league.playoffWeekStart - 1)),
    query<{ season: number; round: number; roster_id: number; owner_id: number }>(
      `SELECT season, round, roster_id, owner_id FROM league_traded_picks WHERE league_id = $1`,
      [leagueId],
    ),
    getTradeValues(ctx.season, ctx.upcomingWeek, format, settings, dynasty ? "dynasty" : "redraft"),
  ]);

  const players = new Map<string, PowerPlayer>();
  for (const v of valued.players) {
    const ppg = v.outlook ? v.outlook.outlook * v.outlook.availability : 0;
    players.set(v.playerId, { playerId: v.playerId, name: v.name, position: v.position, team: v.team, ppg, value: v.value });
  }

  const starterSlots = league.roster_positions.filter((s) => SLOT_ELIGIBILITY[s]);
  const standingRank = new Map(teams.map((t, i) => [t.roster_id, i + 1]));
  const picks = dynasty ? pickValues(league, tradedPicks, standingRank, settings.superflex) : new Map<number, number>();

  const rows = teams.map((team) => {
    const roster = rosters.filter((r) => r.roster_id === team.roster_id);
    const owned = roster.flatMap((r) => players.get(r.player_id) ?? []);
    // Taxi and IR players can't start, but they still count toward the roster's value
    const active = new Set(roster.filter((r) => r.slot === "starter" || r.slot === "bench").map((r) => r.player_id));
    const lineup = bestLineup(owned.filter((p) => active.has(p.playerId)), starterSlots);
    const result = results.get(team.roster_id);
    return {
      team,
      lineup,
      lineupPpg: lineup.reduce((s, p) => s + p.ppg, 0),
      rosterValue: owned.reduce((s, p) => s + p.value, 0),
      pickValue: picks.get(team.roster_id) ?? 0,
      positionStrength: Object.fromEntries(
        SKILL.map((pos) => [pos, positionStrength(owned.filter((p) => active.has(p.playerId)), pos, starterSlots)]),
      ) as Record<Position, number>,
      allPlayPct: result ? result.allPlayWins / result.allPlayGames : null,
      pointsPerGame: result ? result.points / result.games : null,
      core: [...owned].sort((a, b) => b.value - a.value).slice(0, 3),
    };
  });

  const gamesPlayed = Math.max(0, ...[...results.values()].map((r) => r.games));
  const resultsWeight = RESULTS_MAX_WEIGHT * Math.min(gamesPlayed / RESULTS_FULL_WEIGHT_GAMES, 1);
  const lineupScale = scale(rows.map((r) => r.lineupPpg));
  const allPlayScale = scale(rows.map((r) => r.allPlayPct ?? 0));
  const ppgScale = scale(rows.map((r) => r.pointsPerGame ?? 0));
  const totalValue = (r: (typeof rows)[number]) => r.rosterValue + r.pickValue;

  const lineupRank = ranks(rows.map((r) => r.lineupPpg));
  const valueRank = ranks(rows.map(totalValue));
  const positionRanks = Object.fromEntries(SKILL.map((pos) => [pos, ranks(rows.map((r) => r.positionStrength[pos]))]));

  const scored = rows.map((r, i) => {
    const results = 0.6 * allPlayScale(r.allPlayPct ?? 0) + 0.4 * ppgScale(r.pointsPerGame ?? 0);
    const score = (1 - resultsWeight) * lineupScale(r.lineupPpg) + resultsWeight * results;
    return {
      team: r.team,
      rank: 0,
      score,
      lineupPpg: r.lineupPpg,
      lineupRank: lineupRank[i],
      lineup: r.lineup,
      rosterValue: r.rosterValue,
      pickValue: r.pickValue,
      valueRank: valueRank[i],
      positionRanks: Object.fromEntries(SKILL.map((pos) => [pos, positionRanks[pos][i]])) as Record<Position, number>,
      allPlayPct: r.allPlayPct,
      pointsPerGame: r.pointsPerGame,
      standingRank: standingRank.get(r.team.roster_id)!,
      label: "",
      core: r.core,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((t, i) => {
    t.rank = i + 1;
    t.label = label(t, teams.length, dynasty);
  });
  return { teams: scored, dynasty, gamesPlayed, resultsWeight, format };
}

// A one-line read on the team's build
function label(t: PowerTeam, n: number, dynasty: boolean) {
  const third = (rank: number) => (rank <= n / 3 ? "top" : rank > (2 * n) / 3 ? "bottom" : "middle");
  const now = third(t.lineupRank);
  if (dynasty) {
    // Lineup now (rows) vs long-term value (columns), by thirds of the league
    const later = third(t.valueRank);
    const grid: Record<string, Record<string, string>> = {
      top: { top: "Juggernaut", middle: "Win-now", bottom: "Win-now" },
      middle: { top: "Rising", middle: "In the mix", bottom: "Fading" },
      bottom: { top: "Rising", middle: "Rebuild", bottom: "Starting over" },
    };
    return grid[now][later];
  }
  // Redraft: is the record ahead of or behind the roster?
  if (t.standingRank - t.lineupRank >= 4) return "Underachieving";
  if (t.lineupRank - t.standingRank >= 4) return "Overachieving";
  return now === "top" ? "Contender" : now === "bottom" ? "Long shot" : "In the mix";
}

// Fill the most restrictive slots first, each with the best player still available
export function bestLineup(players: PowerPlayer[], slots: string[]): PowerPlayer[] {
  const pool = [...players].sort((a, b) => b.ppg - a.ppg);
  const ordered = [...slots].sort((a, b) => SLOT_ELIGIBILITY[a].length - SLOT_ELIGIBILITY[b].length);
  const lineup: PowerPlayer[] = [];
  for (const slot of ordered) {
    const i = pool.findIndex((p) => SLOT_ELIGIBILITY[slot].includes(p.position));
    if (i >= 0) lineup.push(...pool.splice(i, 1));
  }
  return lineup;
}

// A position room: its starters (dedicated slots, plus a share of flex slots) and one backup
function positionStrength(players: PowerPlayer[], position: Position, slots: string[]) {
  const dedicated = slots.filter((s) => s === position).length;
  const flex = slots.filter((s) => s !== position && SLOT_ELIGIBILITY[s].includes(position)).length;
  const count = Math.max(1, Math.round(dedicated + flex / 2)) + 1;
  return players
    .filter((p) => p.position === position)
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, count)
    .reduce((s, p, i) => s + p.ppg * (i < count - 1 ? 1 : 0.5), 0);
}

// Season-to-date results per team: games, points, and all-play record (vs every team every week)
async function getResults(leagueId: string, throughWeek: number) {
  const rows = await query<{ week: number; roster_id: number; points: number }>(
    `SELECT week, roster_id, points FROM league_matchups
		WHERE league_id = $1 AND week <= $2 AND matchup_id IS NOT NULL`,
    [leagueId, throughWeek],
  );
  const out = new Map<number, { games: number; points: number; allPlayWins: number; allPlayGames: number }>();
  const byWeek = Map.groupBy(rows, (r) => r.week);
  for (const week of byWeek.values()) {
    for (const r of week) {
      const t = out.get(r.roster_id) ?? { games: 0, points: 0, allPlayWins: 0, allPlayGames: 0 };
      t.games++;
      t.points += r.points;
      for (const o of week) {
        if (o.roster_id === r.roster_id) continue;
        t.allPlayGames++;
        t.allPlayWins += r.points > o.points ? 1 : r.points === o.points ? 0.5 : 0;
      }
      out.set(r.roster_id, t);
    }
  }
  return out;
}

// Value of the rookie picks each team owns over the next three drafts. Next year's slot is
// guessed from the original owner's place in the standings; later years count as mid-round.
function pickValues(
  league: LeagueInfo,
  traded: { season: number; round: number; roster_id: number; owner_id: number }[],
  standingRank: Map<number, number>,
  superflex: boolean,
) {
  const firstDraft = league.season + 1;
  const rounds = Math.min(league.settings.draft_rounds ?? PICK_ROUNDS, PICK_ROUNDS);
  const catalog = new Map(buildPicks(firstDraft, superflex).map((p) => [p.id, p.value]));
  const tradedOwner = new Map(traded.map((t) => [`${t.season}-${t.round}-${t.roster_id}`, t.owner_id]));
  const n = league.total_rosters;

  const totals = new Map<number, number>();
  for (const original of standingRank.keys()) {
    const place = standingRank.get(original)!;
    for (let year = firstDraft; year < firstDraft + 3; year++) {
      const slot: PickSlot = year > firstDraft ? "Mid" : place > (2 * n) / 3 ? "Early" : place <= n / 3 ? "Late" : "Mid";
      for (let round = 1; round <= rounds; round++) {
        const owner = tradedOwner.get(`${year}-${round}-${original}`) ?? original;
        const value = catalog.get(`pick-${year}-${round}-${slot.toLowerCase()}`) ?? 0;
        totals.set(owner, (totals.get(owner) ?? 0) + value);
      }
    }
  }
  return totals;
}

// Maps values onto 0–100 within the league
function scale(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
}

// 1 = highest
function ranks(values: number[]) {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const out = new Array<number>(values.length);
  order.forEach(([, i], r) => (out[i] = r + 1));
  return out;
}
