import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { TeamAvatar } from "@/components/TeamAvatar";
import { TeamPicker } from "@/components/TeamPicker";
import { Card, Empty, InjuryTag, PlayerLink, PosBadge, Segmented, fmt } from "@/components/ui";
import {
  getLeague,
  getLeagueId,
  getMyUserId,
  getRoster,
  getScheduleWeeks,
  getTeams,
  getWeekMatchups,
  slotLabel,
  streak,
  type LeagueInfo,
  type Matchup,
  type RosterPlayer,
  type Team,
} from "@/lib/league";
import { safeLoad } from "@/lib/safe";

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;

  const result = await safeLoad(async () => {
    const leagueId = await getLeagueId();
    const league = leagueId ? await getLeague(leagueId) : null;
    if (!leagueId || !league) return null;

    const [teams, weeks, myUserId] = await Promise.all([
      getTeams(leagueId),
      getScheduleWeeks(leagueId, league.playoffWeekStart),
      getMyUserId(),
    ]);
    const defaultWeek = league.lastScoredWeek > 0 ? league.lastScoredWeek : league.currentWeek;
    const week = weeks.includes(Number(params.week)) ? Number(params.week) : defaultWeek;
    const myTeam = teams.find((t) => t.owner_id === myUserId) ?? null;

    const [matchups, roster] = await Promise.all([
      getWeekMatchups(leagueId, week),
      myTeam ? getRoster(leagueId, myTeam.roster_id) : Promise.resolve(null),
    ]);
    return { league, teams, weeks, week, matchups, myTeam, roster };
  });

  if (result.error) return <SetupNotice error={result.error} />;
  if (!result.data) return <NoLeague />;
  const { league, teams, weeks, week, matchups, myTeam, roster } = result.data;
  const byRoster = new Map(teams.map((t) => [t.roster_id, t]));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <TeamAvatar
            url={league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null}
            name={league.name}
            size={44}
          />
          <div className="min-w-0">
            <p className="text-sm text-ink-2">
              {league.season} season · {weekStatus(league)}
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight">{league.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/league/news"
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Read the league paper →
          </Link>
          <TeamPicker teams={teams} value={myTeam?.owner_id ?? null} />
        </div>
      </div>

      <ul className="-mt-3 mb-6 flex flex-wrap gap-1.5">
        {league.tags.map((t) => (
          <li key={t} className="rounded border border-line px-2 py-0.5 text-xs text-ink-2">
            {t}
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card
          title="Standings"
          subtitle={`Top ${league.playoffTeams} make the playoffs (week ${league.playoffWeekStart})`}
          className="lg:col-span-2"
        >
          <Standings teams={teams} playoffTeams={league.playoffTeams} myRosterId={myTeam?.roster_id} />
        </Card>

        <Card
          title={myTeam ? myTeam.team_name : "My team"}
          subtitle={myTeam ? `${myTeam.display_name} · ${record(myTeam)}` : undefined}
        >
          {roster ? (
            <Roster players={roster} slots={league.roster_positions} />
          ) : (
            <Empty>Choose your team above to see your roster here.</Empty>
          )}
        </Card>

        <Card
          title={`Week ${week} matchups`}
          subtitle={week <= league.lastScoredWeek ? "Final" : week === league.currentWeek ? "This week" : "Upcoming"}
          className="lg:col-span-3"
        >
          <div className="mb-4">
            <Segmented items={weeks.map((w) => ({ href: `/league?week=${w}`, label: String(w), active: w === week }))} />
          </div>
          {matchups.length === 0 ? (
            <Empty>No matchups this week.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {matchups.map((m) => (
                <MatchupCard
                  key={m.matchup_id}
                  matchup={m}
                  teams={byRoster}
                  final={week <= league.lastScoredWeek}
                  myRosterId={myTeam?.roster_id}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function weekStatus(league: LeagueInfo) {
  if (league.status === "complete") return "Final";
  if (league.status !== "in_season") return "Preseason";
  return league.currentWeek >= league.playoffWeekStart ? `Playoffs, week ${league.currentWeek}` : `Week ${league.currentWeek}`;
}

function record(t: Team) {
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
}

function TeamName({ team, size = 24 }: { team: Team | undefined; size?: number }) {
  if (!team) return <span className="text-muted">Unknown team</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamAvatar url={team.avatar_url} name={team.team_name} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{team.team_name}</span>
        <span className="block truncate text-xs text-muted">{team.display_name}</span>
      </span>
    </span>
  );
}

function Standings({ teams, playoffTeams, myRosterId }: { teams: Team[]; playoffTeams: number; myRosterId?: number }) {
  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-normal">#</th>
            <th className="w-1/2 py-3 font-normal">Team</th>
            <th className="py-3 text-right font-normal">Record</th>
            <th className="py-3 text-right font-normal">PF</th>
            <th className="py-3 text-right font-normal">PA</th>
            <th className="py-3 text-right font-normal" title="Points with the best possible lineup every week">
              Max PF
            </th>
            <th className="px-4 py-3 text-right font-normal">Streak</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr
              key={t.roster_id}
              className={`${i === playoffTeams - 1 ? "border-b-2 border-dashed border-line" : "border-b border-line/60"} ${
                t.roster_id === myRosterId ? "bg-surface-2" : ""
              }`}
            >
              <td className="tabular px-4 py-2 text-muted">{i + 1}</td>
              <td className="max-w-0 py-2">
                <TeamName team={t} />
              </td>
              <td className="tabular py-2 text-right font-medium">{record(t)}</td>
              <td className="tabular py-2 text-right">{fmt(t.points_for)}</td>
              <td className="tabular py-2 text-right text-ink-2">{fmt(t.points_against)}</td>
              <td className="tabular py-2 text-right text-ink-2">{fmt(t.max_points_for)}</td>
              <td className="tabular px-4 py-2 text-right text-ink-2">{streak(t.record) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchupCard({
  matchup,
  teams,
  final,
  myRosterId,
}: {
  matchup: Matchup;
  teams: Map<number, Team>;
  final: boolean;
  myRosterId?: number;
}) {
  const sides = [matchup.home, matchup.away];
  const winner = final && matchup.home.points !== matchup.away.points
    ? matchup.home.points > matchup.away.points ? matchup.home.roster_id : matchup.away.roster_id
    : null;
  const mine = sides.some((s) => s.roster_id === myRosterId);
  const started = sides.some((s) => s.points > 0);

  return (
    <div className={`rounded-md border p-3 ${mine ? "border-accent" : "border-line"}`}>
      {sides.map((s) => {
        const lost = winner != null && winner !== s.roster_id;
        return (
          <div key={s.roster_id} className="py-1.5">
            <div className={`flex items-center gap-3 text-sm ${lost ? "text-ink-2" : ""}`}>
              <div className="min-w-0 flex-1">
                <TeamName team={teams.get(s.roster_id)} />
              </div>
              <span className={`tabular text-base ${winner === s.roster_id ? "font-semibold" : ""}`}>
                {started ? s.points.toFixed(2) : "–"}
              </span>
            </div>
            {s.top_starter && (
              <p className="mt-1 truncate pl-8 text-xs text-muted">
                Top: {s.top_starter.name} {s.top_starter.points.toFixed(1)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SECTIONS: { slot: RosterPlayer["slot"]; label: string }[] = [
  { slot: "starter", label: "Starters" },
  { slot: "bench", label: "Bench" },
  { slot: "taxi", label: "Taxi squad" },
  { slot: "reserve", label: "Injured reserve" },
];

function Roster({ players, slots }: { players: RosterPlayer[]; slots: string[] }) {
  return (
    <div className="space-y-4">
      {SECTIONS.map(({ slot, label }) => {
        const rows = players.filter((p) => p.slot === slot);
        if (rows.length === 0) return null;
        return (
          <div key={slot}>
            <h3 className="mb-1 text-xs font-medium text-muted">
              {label} <span className="tabular">({rows.length})</span>
            </h3>
            <ul>
              {rows.map((p) => (
                <li key={p.player_id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                  {slot === "starter" && (
                    // Only flex slots need a label; a QB in the QB slot speaks for itself
                    <span className="w-8 shrink-0 text-[10px] font-semibold text-muted">
                      {p.slot_index != null && slots[p.slot_index] !== p.position ? slotLabel(slots[p.slot_index]) : ""}
                    </span>
                  )}
                  <PosBadge position={p.position ?? "?"} />
                  <span className="flex min-w-0 overflow-hidden">
                    <PlayerLink id={p.player_id} name={p.name} position={p.position} />
                  </span>
                  <span className="shrink-0 text-xs text-muted">{p.team ?? "FA"}</span>
                  <InjuryTag status={p.injury_status} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function NoLeague() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6">
      <h1 className="text-base font-semibold">No league imported yet</h1>
      <p className="mt-2 text-sm text-ink-2">
        Import your Sleeper league. The league ID is the number in your league&apos;s URL on sleeper.com.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">
        {`npm run league -- --league <league ID>`}
      </pre>
      <p className="mt-3 text-xs text-muted">
        To make it the site&apos;s league for good, add <code>LEAGUE_ID=&lt;league ID&gt;</code> to <code>.env.local</code>.
      </p>
    </div>
  );
}
