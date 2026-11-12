// The weekly league newspaper. An edition is stored whole (facts + stories) as JSON in
// league_editions.content, so the page renders from the snapshot and never shifts afterward.

export type TeamRef = {
  roster_id: number;
  name: string; // team name
  manager: string; // Sleeper display name
  avatar_url: string | null;
};

export type PlayerLine = {
  player_id: string;
  name: string;
  position: string;
  points: number;
  avg: number | null; // his average in this league's scoring before this week
};

export type Side = {
  team: TeamRef;
  points: number;
  record: string; // after this week, e.g. "6-3"
  top: PlayerLine[]; // best starters, highest first
  dud: PlayerLine | null; // starter furthest below his average
  benchBlunder: { bench: PlayerLine; starter: PlayerLine } | null; // bench player who would have scored more
};

export type Storyline = "upset" | "blowout" | "nailbiter" | "shootout" | "slugfest" | "standard";

export type Result = {
  matchup_id: number;
  winner: Side;
  loser: Side;
  tie: boolean;
  margin: number;
  storyline: Storyline;
};

export type TeamStat = { team: TeamRef; points: number };

export type Awards = {
  high: TeamStat;
  low: TeamStat;
  luckiestWin: TeamStat | null; // lowest score that still won
  unluckiestLoss: TeamStat | null; // highest score that still lost
  blowout: { winner: TeamRef; loser: TeamRef; margin: number };
  closest: { winner: TeamRef; loser: TeamRef; margin: number };
};

export type StandingRow = {
  team: TeamRef;
  rank: number;
  prevRank: number | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  allPlayWins: number; // season record if you played every team every week
  allPlayLosses: number;
  luck: number; // actual wins minus all-play expected wins
};

export type Trade = { sides: { team: TeamRef; gets: string[] }[] };
export type Claim = { team: TeamRef; player: string; position: string; bid: number | null; type: "waiver" | "free_agent" };

export type Preview = {
  matchup_id: number;
  sides: {
    team: TeamRef;
    record: string;
    projected: number;
    key: PlayerLine[]; // highest-projected starters (points = projection)
  }[];
  favorite: number; // roster_id
  winProb: number; // favorite's chance, 0.5–1
};

export type Facts = {
  league: { name: string; season: number; avatar_url: string | null; playoffTeams: number; playoffWeekStart: number };
  week: number;
  nextWeek: number | null; // null after the last regular-season week
  results: Result[];
  awards: Awards;
  stars: (PlayerLine & { team: TeamRef })[];
  duds: (PlayerLine & { team: TeamRef })[];
  standings: StandingRow[];
  trades: Trade[];
  claims: Claim[]; // biggest waiver bids and notable adds this week
  pickup: (PlayerLine & { team: TeamRef; weeksAgo: number }) | null; // recent add who delivered as a starter
  previews: Preview[];
};

export type Story = { headline: string; deck?: string; body: string[] };

export type Stories = {
  lead: Story & { matchup_id: number };
  recaps: (Story & { matchup_id: number })[]; // every other result
  previews: (Story & { matchup_id: number })[];
  column: Story; // "Around the league": awards, luck, standings notes
};

export type Edition = { facts: Facts; stories: Stories };
