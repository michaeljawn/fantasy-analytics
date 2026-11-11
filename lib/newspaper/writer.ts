// Template writer: turns an edition's facts into stories. Every number comes from the facts.
// Phrasing varies by storyline, picked by a seeded hash, so the same week always reads the
// same while different weeks and matchups don't sound alike. A Claude-backed writer can
// replace this later with the same input and output.

import type { Facts, PlayerLine, Preview, Result, Side, StandingRow, Stories, Story, Storyline, TeamRef } from "./types";

export function writeStories(facts: Facts): Stories {
  const [lead, ...rest] = facts.results;
  return {
    lead: { matchup_id: lead.matchup_id, ...leadStory(facts, lead) },
    recaps: rest.map((r) => ({ matchup_id: r.matchup_id, ...recap(facts, r) })),
    previews: facts.previews.map((p) => ({ matchup_id: p.matchup_id, ...preview(facts, p) })),
    column: column(facts),
  };
}

// ──────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────

const HEADLINES: Record<Storyline, string[]> = {
  upset: ["{W} Stuns {L}", "Upset Alert: {W} Topples {L}", "{W} Plays Spoiler Against {L}"],
  nailbiter: ["{W} Survives {L} by {M}", "Photo Finish: {W} Edges {L}", "{W} Escapes {L} in a Thriller"],
  blowout: ["{W} Routs {L} by {M}", "{W} Buries {L}", "No Contest: {W} Rolls Past {L}"],
  shootout: ["{W} Outguns {L} in a Shootout", "Fireworks as {W} Outlasts {L}", "{W} Wins a Track Meet Against {L}"],
  slugfest: ["{W} Grinds Out an Ugly Win Over {L}", "{W} Wins a Rock Fight Against {L}", "Nobody Looked Good, but {W} Beat {L}"],
  standard: ["{W} Handles {L}", "{W} Takes Care of Business Against {L}", "{W} Gets Past {L}"],
};

const LEDES: Record<Storyline, string[]> = {
  upset: [
    "Nobody saw this one coming. {W} took down {L}, {WP} to {LP}.",
    "The standings said {L}. The scoreboard said {W}, {WP} to {LP}.",
    "Throw out the records. {W} beat {L} {WP} to {LP} in the upset of the week.",
  ],
  nailbiter: [
    "It came down to the final snaps. {W} held off {L} {WP} to {LP}, a margin of just {M} points.",
    "Check the box score twice: {W} {WP}, {L} {LP}. That's a {M}-point game.",
    "{W} beat {L} by {M} points, {WP} to {LP}, in a game that went down to the wire.",
  ],
  blowout: [
    "This one was over early. {W} hung {WP} on {L}, who managed {LP}.",
    "{W} won by {M}. That's not a typo. The final: {WP} to {LP}.",
    "{L} would like to forget this week. {W} won {WP} to {LP}.",
  ],
  shootout: [
    "Points everywhere. {W} outlasted {L} {WP} to {LP} in the highest-scoring game of the week.",
    "{L} scored {LP} and lost. That's how good {W} was, posting {WP}.",
    "Both offenses showed up, but {W} had a little more: {WP} to {LP}.",
  ],
  slugfest: [
    "It wasn't pretty. {W} beat {L} {WP} to {LP}.",
    "Style points: none. Wins: one. {W} topped {L} {WP} to {LP}.",
    "{W} won ugly, {WP} to {LP}, and nobody is apologizing.",
  ],
  standard: [
    "{W} beat {L} {WP} to {LP}.",
    "{W} took care of {L}, {WP} to {LP}.",
    "{W} got the job done against {L}, winning {WP} to {LP}.",
  ],
};

function leadStory(facts: Facts, r: Result): Story {
  const vars = resultVars(r);
  const seed = `${facts.week}:${r.matchup_id}`;
  const winnerStar = r.winner.top[0];
  const body = [
    fill(choose(`${seed}:lede`, LEDES[r.storyline]), vars),
    starLine(r.winner, seed),
    loserLine(r.loser, seed),
    benchLine(r.winner, r.loser),
    standingsLine(facts, r),
  ].filter((p): p is string => !!p);

  return {
    headline: fill(choose(`${seed}:head`, HEADLINES[r.storyline]), vars),
    deck: winnerStar
      ? `${winnerStar.name} posts ${pts1(winnerStar.points)} as ${r.winner.team.name} moves to ${r.winner.record}`
      : undefined,
    body,
  };
}

function recap(facts: Facts, r: Result): Story {
  const vars = resultVars(r);
  const seed = `${facts.week}:${r.matchup_id}`;
  return {
    headline: fill(choose(`${seed}:head`, HEADLINES[r.storyline]), vars),
    body: [
      [fill(choose(`${seed}:lede`, LEDES[r.storyline]), vars), starLine(r.winner, seed)].filter(Boolean).join(" "),
      [loserLine(r.loser, seed), benchLine(r.winner, r.loser)].filter(Boolean).join(" "),
    ].filter(Boolean),
  };
}

function resultVars(r: Result) {
  return {
    W: r.winner.team.name,
    L: r.loser.team.name,
    WP: pts2(r.winner.points),
    LP: pts2(r.loser.points),
    M: pts2(r.margin),
  };
}

function starLine(s: Side, seed: string) {
  const [a, b] = s.top;
  if (!a) return null;
  const first = choose(`${seed}:star`, [
    `${a.name} led the way with ${pts1(a.points)}${aboveAverage(a)}`,
    `${a.name} carried ${s.team.name} with ${pts1(a.points)}${aboveAverage(a)}`,
    `The star was ${a.name}: ${pts1(a.points)} points${aboveAverage(a)}`,
  ]);
  return b ? `${first}, and ${b.name} added ${pts1(b.points)}.` : `${first}.`;
}

function loserLine(s: Side, seed: string) {
  const a = s.top[0];
  const parts: string[] = [];
  if (a) parts.push(choose(`${seed}:loser`, [
    `For ${s.team.name}, ${a.name} did his part with ${pts1(a.points)}`,
    `${a.name} gave ${s.team.name} ${pts1(a.points)}`,
    `${s.team.name} got ${pts1(a.points)} from ${a.name}`,
  ]));
  if (s.dud && s.dud.player_id !== a?.player_id) {
    const below = pts1(s.dud.avg! - s.dud.points);
    parts.push(`${a ? "but " : ""}${s.dud.name} managed just ${pts1(s.dud.points)}, ${below} below his average`);
  }
  if (!parts.length) return null;
  return `${capitalize(parts.join(", "))}.`;
}

function benchLine(winner: Side, loser: Side) {
  if (loser.benchBlunder) {
    const { bench, starter } = loser.benchBlunder;
    return `Salt in the wound: ${bench.name} scored ${pts1(bench.points)} on ${possessive(loser.team.name)} bench while ${starter.name} started and put up ${pts1(starter.points)}.`;
  }
  if (winner.benchBlunder) {
    const { bench, starter } = winner.benchBlunder;
    return `${winner.team.name} could afford to leave ${bench.name} (${pts1(bench.points)}) on the bench in favor of ${starter.name} (${pts1(starter.points)}).`;
  }
  return null;
}

function standingsLine(facts: Facts, r: Result) {
  const w = standing(facts, r.winner.team);
  const l = standing(facts, r.loser.team);
  if (!w || !l) return null;
  const cut = facts.league.playoffTeams;
  const where = (s: StandingRow) =>
    s.rank <= cut ? "inside the playoff picture" : `${s.rank - cut} spot${s.rank - cut > 1 ? "s" : ""} outside the playoff picture`;
  return `${r.winner.team.name} (${r.winner.record}) sits ${ordinal(w.rank)}, ${where(w)}. ${r.loser.team.name} (${r.loser.record}) is ${ordinal(l.rank)}.`;
}

// ──────────────────────────────────────────────
// Previews
// ──────────────────────────────────────────────

function preview(facts: Facts, p: Preview): Story {
  const [fav, dog] = p.sides[0].team.roster_id === p.favorite ? [p.sides[0], p.sides[1]] : [p.sides[1], p.sides[0]];
  const seed = `${facts.week}:preview:${p.matchup_id}`;
  const pct = Math.round(p.winProb * 100);
  const fs = standing(facts, fav.team);
  const ds = standing(facts, dog.team);

  const framing =
    fs && ds && fs.rank <= 3 && ds.rank <= 3
      ? "A heavyweight bout between two of the league's top three."
      : fs && ds && Math.abs(fs.rank - facts.league.playoffTeams) <= 1 && Math.abs(ds.rank - facts.league.playoffTeams) <= 1
        ? "Both teams are hovering around the playoff line, so this one matters."
        : null;
  const odds =
    pct < 56
      ? choose(`${seed}:odds`, ["Call it a coin flip.", "Too close to call.", "Pick 'em."])
      : pct >= 80
        ? choose(`${seed}:odds`, ["Upset special? It would take one.", `${dog.team.name} needs a miracle.`, "On paper, a mismatch."])
        : null;

  const fk = fav.key[0];
  const dk = dog.key[0];
  return {
    headline: `${fav.team.name} (${fav.record}) vs. ${dog.team.name} (${dog.record})`,
    body: [
      [
        framing,
        `The projections have ${fav.team.name} at ${pts1(fav.projected)} to ${pts1(dog.projected)}, a ${pct}% favorite.`,
        odds,
      ].filter(Boolean).join(" "),
      [
        fk && `Watch ${fk.name}, projected for ${pts1(fk.points)}.`,
        dk && `${dog.team.name} needs a big day from ${dk.name} (${pts1(dk.points)} projected).`,
      ].filter(Boolean).join(" "),
    ].filter(Boolean),
  };
}

// ──────────────────────────────────────────────
// Around the league
// ──────────────────────────────────────────────

function column(facts: Facts): Story {
  const { awards, standings } = facts;
  const scores = facts.results.flatMap((r) => [r.winner.points, r.loser.points]);
  const beaten = (points: number) => scores.filter((s) => s < points).length;
  const body: string[] = [];

  body.push(
    `${awards.high.team.name} posted the week's high score, ${pts2(awards.high.points)}. ` +
      `${awards.low.team.name} brought up the rear with ${pts2(awards.low.points)}.`,
  );

  const luck: string[] = [];
  if (awards.luckiestWin) luck.push(`${awards.luckiestWin.team.name} won with just ${pts2(awards.luckiestWin.points)}, the lowest winning score of the week.`);
  if (awards.unluckiestLoss) {
    const n = beaten(awards.unluckiestLoss.points);
    luck.push(`${awards.unluckiestLoss.team.name} scored ${pts2(awards.unluckiestLoss.points)} and still lost; that would have beaten ${n} of the other ${scores.length - 1} teams.`);
  }
  if (luck.length) body.push(luck.join(" "));

  if (facts.week >= 3 && standings.length) {
    const lucky = standings.reduce((a, b) => (b.luck > a.luck ? b : a));
    const unlucky = standings.reduce((a, b) => (b.luck < a.luck ? b : a));
    if (lucky.luck >= 1)
      body.push(
        `Luckiest team in the league: ${lucky.team.name}. It's ${lucky.wins}-${lucky.losses}, but against every team every week it would be ${lucky.allPlayWins}-${lucky.allPlayLosses}, worth about ${pts1(lucky.wins - lucky.luck)} wins.` +
          (unlucky.luck <= -1
            ? ` ${unlucky.team.name} has the opposite problem: ${unlucky.wins}-${unlucky.losses} despite an all-play record of ${unlucky.allPlayWins}-${unlucky.allPlayLosses}.`
            : ""),
      );
  }

  const movers = standings.filter((s) => s.prevRank != null).sort((a, b) => b.prevRank! - b.rank - (a.prevRank! - a.rank));
  const up = movers[0];
  const down = movers.at(-1);
  if (up && up.prevRank! - up.rank >= 2) {
    body.push(
      `Biggest climb: ${up.team.name}, up ${up.prevRank! - up.rank} spots to ${ordinal(up.rank)}.` +
        (down && down.rank - down.prevRank! >= 2 ? ` Biggest fall: ${down.team.name}, down ${down.rank - down.prevRank!} to ${ordinal(down.rank)}.` : ""),
    );
  }

  if (facts.pickup) {
    const p = facts.pickup;
    const when = p.weeksAgo === 0 ? "this week" : p.weeksAgo === 1 ? "last week" : `${p.weeksAgo} weeks ago`;
    body.push(`Pickup of the week: ${p.name}, added by ${p.team.name} ${when}, scored ${pts1(p.points)} in the starting lineup.`);
  }

  return { headline: "Around the League", body };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function standing(facts: Facts, team: TeamRef) {
  return facts.standings.find((s) => s.team.roster_id === team.roster_id);
}

function aboveAverage(p: PlayerLine) {
  return p.avg != null && p.points - p.avg >= 8 ? `, well above his ${pts1(p.avg)} average` : "";
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Deterministic choice: the same seed always picks the same option
function choose<T>(seed: string, options: T[]): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return options[(h >>> 0) % options.length];
}

const pts1 = (n: number) => n.toFixed(1);
const pts2 = (n: number) => n.toFixed(2);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}
