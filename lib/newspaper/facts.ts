// Computes every fact in an edition from the imported league. The writer only turns these
// into prose; it never makes up a number.

import { query } from "../db";
import { leaguePoints } from "./scoring";
import type {
  Awards,
  Claim,
  Facts,
  PlayerLine,
  Preview,
  Result,
  Side,
  StandingRow,
  Storyline,
  TeamRef,
  Trade,
} from "./types";

const SLEEPER_STATS = "https://api.sleeper.com";
const SKILL = ["QB", "RB", "WR", "TE"];
// Spread of a fantasy matchup result (difference of two team scores), for win probability
const MATCHUP_SD = 35;

type LeagueRow = {
  league_id: string;
  season: number;
  name: string;
  avatar: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
};

type MatchupRow = {
  week: number;
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[];
  starters_points: number[];
  players_points: Record<string, number>;
};

type TransactionRow = {
  week: number;
  type: string;
  roster_ids: number[];
  adds: Record<string, number>;
  drops: Record<string, number>;
  draft_picks: { season: string; round: number; roster_id: number; owner_id: number }[];
  waiver_budget: { sender: number; receiver: number; amount: number }[];
  waiver_bid: number | null;
};

export async function buildFacts(leagueId: string, week: number): Promise<Facts> {
  const [league] = await query<LeagueRow>(
    `SELECT league_id, season, name, avatar, roster_positions, scoring_settings, settings FROM leagues WHERE league_id = $1`,
    [leagueId],
  );
  if (!league) throw new Error(`League ${leagueId} isn't imported`);
  const playoffWeekStart = league.settings.playoff_week_start ?? 15;
  const lastScored = league.settings.last_scored_leg ?? 0;
  if (week < 1 || week >= playoffWeekStart) throw new Error(`Week ${week} isn't a regular-season week`);
  if (week > lastScored) throw new Error(`Week ${week} doesn't have final scores yet (last final week: ${lastScored})`);
  const nextWeek = week + 1 < playoffWeekStart ? week + 1 : null;

  const [teamRows, matchups, transactions, parked] = await Promise.all([
    query<TeamRef & { owner_id: string | null }>(
      `SELECT r.roster_id, r.owner_id,
				COALESCE(u.team_name, 'Team ' || u.display_name, 'Team ' || r.roster_id) AS name,
				COALESCE(u.display_name, 'Open team') AS manager, u.avatar_url
			FROM league_rosters r
			LEFT JOIN league_users u ON u.league_id = r.league_id AND u.user_id = r.owner_id
			WHERE r.league_id = $1`,
      [leagueId],
    ),
    query<MatchupRow>(
      `SELECT week, roster_id, matchup_id, points, starters, starters_points, players_points
			FROM league_matchups WHERE league_id = $1 AND week <= $2 ORDER BY week, matchup_id, roster_id`,
      [leagueId, nextWeek ?? week],
    ),
    query<TransactionRow>(
      `SELECT week, type, roster_ids, adds, drops, draft_picks, waiver_budget, waiver_bid
			FROM league_transactions
			WHERE league_id = $1 AND status = 'complete' AND week BETWEEN $2 AND $3
			ORDER BY created_at`,
      [leagueId, week - 2, week],
    ),
    // Taxi and IR players can't be started, so they never count as bench points left behind
    query<{ player_id: string }>(
      `SELECT player_id FROM league_roster_players WHERE league_id = $1 AND slot IN ('taxi', 'reserve')`,
      [leagueId],
    ),
  ]);

  const teams = new Map(teamRows.map(({ owner_id: _, ...t }) => [t.roster_id, t as TeamRef]));
  const team = (rosterId: number) => teams.get(rosterId) ?? { roster_id: rosterId, name: `Team ${rosterId}`, manager: "", avatar_url: null };
  const parkedIds = new Set(parked.map((p) => p.player_id));

  const thisWeek = matchups.filter((m) => m.week === week && m.matchup_id != null);
  const upcoming = nextWeek ? matchups.filter((m) => m.week === nextWeek && m.matchup_id != null) : [];
  const played = matchups.filter((m) => m.week <= week && m.matchup_id != null);

  const ids = new Set<string>();
  for (const m of [...thisWeek, ...upcoming]) {
    Object.keys(m.players_points).forEach((id) => ids.add(id));
    m.starters.forEach((id) => id !== "0" && ids.add(id));
  }
  const players = await getPlayers([...ids]);
  const averages = playerAverages(matchups.filter((m) => m.week < week));
  const line = (id: string, points: number): PlayerLine => ({
    player_id: id,
    name: players.get(id)?.name ?? `Player ${id}`,
    position: players.get(id)?.position ?? "?",
    points,
    avg: averages.get(id) ?? null,
  });

  // ── Standings, before and after this week ──
  const standings = buildStandings(played, week, team);
  const before = week > 1 ? buildStandings(played.filter((m) => m.week < week), week - 1, team) : [];
  const prevRank = new Map(before.map((s) => [s.team.roster_id, s.rank]));
  for (const s of standings) s.prevRank = prevRank.get(s.team.roster_id) ?? null;
  const recordOf = (rows: StandingRow[], rosterId: number) => {
    const s = rows.find((r) => r.team.roster_id === rosterId);
    return s ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}` : "0-0";
  };
  const winPctBefore = (rosterId: number) => {
    const s = before.find((r) => r.team.roster_id === rosterId);
    const games = s ? s.wins + s.losses + s.ties : 0;
    return games ? (s!.wins + s!.ties / 2) / games : 0.5;
  };

  // ── Results ──
  const weekMean = thisWeek.reduce((sum, m) => sum + m.points, 0) / Math.max(thisWeek.length, 1);
  const side = (m: MatchupRow): Side => {
    const starters = m.starters
      .map((id, i) => ({ id, slot: league.roster_positions[i], points: m.starters_points[i] ?? 0 }))
      .filter((s) => s.id !== "0");
    const top = [...starters].sort((a, b) => b.points - a.points).slice(0, 3).map((s) => line(s.id, s.points));

    const dud = starters
      .map((s) => line(s.id, s.points))
      .filter((p) => p.avg != null && p.avg >= 10 && p.avg - p.points >= 8)
      .sort((a, b) => a.points - a.avg! - (b.points - b.avg!))[0] ?? null;

    // Bench player who outscored a starter he could have replaced, by the widest margin
    let benchBlunder: Side["benchBlunder"] = null;
    const starterIds = new Set(m.starters);
    for (const [id, pts] of Object.entries(m.players_points)) {
      if (starterIds.has(id) || parkedIds.has(id)) continue;
      const position = players.get(id)?.position;
      if (!position) continue;
      for (const s of starters) {
        const gap = pts - s.points;
        if (canPlay(position, s.slot) && gap >= 10 && gap > (benchBlunder ? benchBlunder.bench.points - benchBlunder.starter.points : 0)) {
          benchBlunder = { bench: line(id, pts), starter: line(s.id, s.points) };
        }
      }
    }
    return { team: team(m.roster_id), points: m.points, record: recordOf(standings, m.roster_id), top, dud, benchBlunder };
  };

  const results: Result[] = pairs(thisWeek).map(([a, b]) => {
    const [w, l] = a.points >= b.points ? [a, b] : [b, a];
    const margin = Math.round((w.points - l.points) * 100) / 100;
    return {
      matchup_id: a.matchup_id!,
      winner: side(w),
      loser: side(l),
      tie: margin === 0,
      margin,
      storyline: storyline(week, margin, w, l, weekMean, winPctBefore),
    };
  });

  // ── Awards ──
  const byPoints = [...thisWeek].sort((a, b) => b.points - a.points);
  const stat = (m: MatchupRow) => ({ team: team(m.roster_id), points: m.points });
  const winners = results.filter((r) => !r.tie).map((r) => r.winner);
  const losers = results.filter((r) => !r.tie).map((r) => r.loser);
  const byMargin = [...results].filter((r) => !r.tie).sort((a, b) => b.margin - a.margin);
  const awards: Awards = {
    high: stat(byPoints[0]),
    low: stat(byPoints.at(-1)!),
    luckiestWin: winners.length ? teamStat(best(winners, (s) => -s.points)) : null,
    unluckiestLoss: losers.length ? teamStat(best(losers, (s) => s.points)) : null,
    blowout: matchupAward(byMargin[0] ?? results[0]),
    closest: matchupAward(byMargin.at(-1) ?? results[0]),
  };

  // ── Stars and duds across the league ──
  const allStarters = thisWeek.flatMap((m) =>
    m.starters
      .map((id, i) => ({ ...line(id, m.starters_points[i] ?? 0), team: team(m.roster_id) }))
      .filter((p) => p.player_id !== "0"),
  );
  const stars = [...allStarters].sort((a, b) => b.points - a.points).slice(0, 5);
  const duds = allStarters
    .filter((p) => p.avg != null && p.avg >= 10 && p.avg - p.points >= 8)
    .sort((a, b) => a.points - a.avg! - (b.points - b.avg!))
    .slice(0, 3);

  // ── Transactions ──
  const names = await getPlayers(transactions.flatMap((t) => Object.keys(t.adds ?? {})));
  const playerName = (id: string) => names.get(id)?.name ?? players.get(id)?.name ?? `Player ${id}`;
  const trades: Trade[] = transactions
    .filter((t) => t.type === "trade" && t.week === week)
    .map((t) => ({
      sides: t.roster_ids.map((rid) => ({
        team: team(rid),
        gets: [
          ...Object.entries(t.adds ?? {}).filter(([, to]) => to === rid).map(([id]) => playerName(id)),
          ...t.draft_picks
            .filter((p) => p.owner_id === rid)
            .map((p) => `${p.season} ${ordinal(p.round)}-round pick${p.roster_id !== rid ? ` (via ${team(p.roster_id).name})` : ""}`),
          ...t.waiver_budget.filter((b) => b.receiver === rid).map((b) => `$${b.amount} FAAB`),
        ],
      })),
    }));

  const claims: Claim[] = transactions
    .filter((t) => (t.type === "waiver" || t.type === "free_agent") && t.week === week)
    .flatMap((t) =>
      Object.entries(t.adds ?? {}).map(([id, rid]) => ({
        team: team(rid),
        player: playerName(id),
        position: names.get(id)?.position ?? "?",
        bid: t.waiver_bid,
        type: t.type as Claim["type"],
      })),
    )
    .sort((a, b) => (b.bid ?? -1) - (a.bid ?? -1))
    .slice(0, 6);

  // Recent pickup (last three weeks) who delivered as a starter this week
  let pickup: Facts["pickup"] = null;
  for (const t of transactions.filter((t) => t.type === "waiver" || t.type === "free_agent")) {
    for (const [id, rid] of Object.entries(t.adds ?? {})) {
      const m = thisWeek.find((x) => x.roster_id === rid);
      const i = m?.starters.indexOf(id) ?? -1;
      if (!m || i < 0) continue;
      const pts = m.starters_points[i] ?? 0;
      if (pts >= 12 && (!pickup || pts > pickup.points)) pickup = { ...line(id, pts), team: team(rid), weeksAgo: week - t.week };
    }
  }

  // ── Next week's previews ──
  const previews: Preview[] = [];
  if (nextWeek && upcoming.length) {
    const projections = await getProjections(league, nextWeek);
    for (const [a, b] of pairs(upcoming)) {
      const sides = [a, b].map((m) => {
        const starters = m.starters.filter((id) => id !== "0");
        const projected = starters.reduce((sum, id) => sum + (projections.get(id) ?? 0), 0);
        const key = starters
          .map((id) => line(id, projections.get(id) ?? 0))
          .sort((x, y) => y.points - x.points)
          .slice(0, 2);
        return { team: team(m.roster_id), record: recordOf(standings, m.roster_id), projected: round1(projected), key };
      });
      const diff = sides[0].projected - sides[1].projected;
      previews.push({
        matchup_id: a.matchup_id!,
        sides,
        favorite: diff >= 0 ? sides[0].team.roster_id : sides[1].team.roster_id,
        // Nothing is certain in fantasy football; cap at 99%
        winProb: Math.min(0.99, Math.round(normalCdf(Math.abs(diff) / MATCHUP_SD) * 100) / 100),
      });
    }
  }

  return {
    league: {
      name: league.name,
      season: league.season,
      avatar_url: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
      playoffTeams: league.settings.playoff_teams ?? 6,
      playoffWeekStart,
    },
    week,
    nextWeek,
    results: results.sort((a, b) => drama(b) - drama(a)),
    awards,
    stars,
    duds,
    standings,
    trades,
    claims,
    pickup,
    previews,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

// Teams sharing a matchup_id play each other; rows arrive sorted by matchup_id
function pairs(rows: MatchupRow[]): [MatchupRow, MatchupRow][] {
  const out: [MatchupRow, MatchupRow][] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    if (rows[i].matchup_id === rows[i + 1].matchup_id) out.push([rows[i], rows[i + 1]]);
  }
  return out;
}

function canPlay(position: string, slot: string) {
  if (slot === position) return true;
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (slot === "SUPER_FLEX") return SKILL.includes(position);
  if (slot === "REC_FLEX") return ["WR", "TE"].includes(position);
  if (slot === "WRRB_FLEX") return ["WR", "RB"].includes(position);
  return false;
}

function storyline(
  week: number,
  margin: number,
  w: MatchupRow,
  l: MatchupRow,
  mean: number,
  winPctBefore: (rosterId: number) => number,
): Storyline {
  if (week >= 3 && winPctBefore(l.roster_id) - winPctBefore(w.roster_id) >= 0.25) return "upset";
  if (margin < 5) return "nailbiter";
  if (margin >= 45) return "blowout";
  if (l.points >= mean + 15) return "shootout";
  if (w.points < mean - 20) return "slugfest";
  return "standard";
}

// How front-page-worthy a result is
function drama(r: Result) {
  switch (r.storyline) {
    case "upset":
      return 100 - r.margin / 2;
    case "nailbiter":
      return 90 - r.margin;
    case "shootout":
      return 70 + r.loser.points / 20;
    case "blowout":
      return 60 + r.margin / 10;
    default:
      return r.winner.points / 10;
  }
}

function buildStandings(played: MatchupRow[], throughWeek: number, team: (id: number) => TeamRef): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  const get = (id: number) => {
    if (!rows.has(id)) {
      rows.set(id, { team: team(id), rank: 0, prevRank: null, wins: 0, losses: 0, ties: 0, pointsFor: 0, allPlayWins: 0, allPlayLosses: 0, luck: 0 });
    }
    return rows.get(id)!;
  };

  for (let week = 1; week <= throughWeek; week++) {
    const games = played.filter((m) => m.week === week);
    for (const [a, b] of pairs(games)) {
      const [sa, sb] = [get(a.roster_id), get(b.roster_id)];
      sa.pointsFor += a.points;
      sb.pointsFor += b.points;
      if (a.points > b.points) (sa.wins++, sb.losses++);
      else if (b.points > a.points) (sb.wins++, sa.losses++);
      else (sa.ties++, sb.ties++);
    }
    // All-play: your score against every other team's score that week
    for (const m of games) {
      const s = get(m.roster_id);
      for (const o of games) {
        if (o.roster_id === m.roster_id) continue;
        if (m.points > o.points) s.allPlayWins++;
        else if (m.points < o.points) s.allPlayLosses++;
      }
    }
  }

  const list = [...rows.values()];
  for (const s of list) {
    const games = s.wins + s.losses + s.ties;
    const allPlay = s.allPlayWins + s.allPlayLosses;
    s.luck = allPlay ? round1(s.wins - (s.allPlayWins / allPlay) * games) : 0;
    s.pointsFor = round1(s.pointsFor);
  }
  list.sort((a, b) => b.wins - a.wins || b.ties - a.ties || b.pointsFor - a.pointsFor);
  list.forEach((s, i) => (s.rank = i + 1));
  return list;
}

// Average league points per game played, from every roster's players_points
function playerAverages(rows: MatchupRow[]) {
  const totals = new Map<string, { sum: number; games: number }>();
  for (const m of rows) {
    for (const [id, pts] of Object.entries(m.players_points)) {
      if (pts === 0) continue; // byes and inactives
      const t = totals.get(id) ?? { sum: 0, games: 0 };
      t.sum += pts;
      t.games++;
      totals.set(id, t);
    }
  }
  return new Map([...totals].filter(([, t]) => t.games >= 2).map(([id, t]) => [id, round1(t.sum / t.games)]));
}

async function getPlayers(ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; position: string }>();
  const rows = await query<{ player_id: string; name: string; position: string }>(
    `SELECT player_id, first_name || ' ' || last_name AS name, position FROM players WHERE player_id = ANY($1)`,
    [ids],
  );
  return new Map(rows.map((r) => [r.player_id, r]));
}

// Sleeper's projected stats for the week, scored with the league's rules
async function getProjections(league: LeagueRow, week: number) {
  const positions = SKILL.map((p) => `position[]=${p}`).join("&");
  const res = await fetch(`${SLEEPER_STATS}/projections/nfl/${league.season}/${week}?season_type=regular&${positions}`);
  if (!res.ok) throw new Error(`Projections for week ${week}: HTTP ${res.status}`);
  const rows: { player_id: string; stats: Record<string, number>; player?: { position?: string } }[] = await res.json();
  return new Map(rows.map((r) => [r.player_id, leaguePoints(r.stats ?? {}, r.player?.position, league.scoring_settings)]));
}

function matchupAward(r: Result) {
  return { winner: r.winner.team, loser: r.loser.team, margin: r.margin };
}

function best<T>(items: T[], score: (t: T) => number) {
  return items.reduce((a, b) => (score(b) > score(a) ? b : a));
}

const teamStat = (s: Side) => ({ team: s.team, points: s.points });

function ordinal(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Standard normal CDF (Abramowitz–Stegun 7.1.26)
function normalCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
