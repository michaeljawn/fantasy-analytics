import { LeagueHeader } from "@/components/leagues/LeagueHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { TeamAvatar } from "@/components/TeamAvatar";
import { Card, Empty, PlayerLink, PosBadge } from "@/components/ui";
import { FORMATS, type Position } from "@/lib/formats";
import { getLeague, getLeagueId, getMyUserId, getSwitcherLeagues, getTeams, type Team } from "@/lib/league";
import { managerColor } from "@/lib/manager-color";
import { getPowerRankings, type PowerTeam } from "@/lib/power";
import { safeLoad } from "@/lib/safe";

export const metadata = { title: "Power rankings" };

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export default async function PowerRankingsPage() {
  const result = await safeLoad(async () => {
    const leagueId = await getLeagueId();
    const league = leagueId ? await getLeague(leagueId) : null;
    if (!league) return null;
    const [teams, myUserId, switcher, power] = await Promise.all([
      getTeams(league.league_id),
      getMyUserId(),
      getSwitcherLeagues(league),
      getPowerRankings(league),
    ]);
    return { league, teams, myUserId, switcher, power };
  });

  if (result.error != null) return <SetupNotice error={result.error} />;
  if (!result.data) return <SetupNotice error="No league yet. Add one on the Your leagues page." />;
  const { league, teams, myUserId, switcher, power } = result.data;
  const n = power.teams.length;

  if (power.teams.every((t) => t.lineup.length === 0)) {
    return (
      <>
        <LeagueHeader league={league} leagues={switcher} teams={teams} myUserId={myUserId} tab="power" />
        <Card>
          <Empty>Power rankings start once teams have players. Check back after your draft.</Empty>
        </Card>
      </>
    );
  }
  const resultsPct = Math.round(power.resultsWeight * 100);
  const format = FORMATS.find((f) => f.id === power.format)?.label ?? "PPR";

  return (
    <>
      <LeagueHeader league={league} leagues={switcher} teams={teams} myUserId={myUserId} tab="power" />

      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        Ranked by how each team is built, blended with how it has played.{" "}
        {power.gamesPlayed === 0
          ? "No games yet, so this is all roster."
          : `After ${power.gamesPlayed} ${power.gamesPlayed === 1 ? "week" : "weeks"}, results count for ${resultsPct}% and the roster for ${100 - resultsPct}%.`}
      </p>

      <div className="grid gap-4 [&>*]:min-w-0">
        <Card title="Power rankings" subtitle={`Lineups projected in ${format} scoring`}>
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-normal">#</th>
                  <th className="w-[30%] py-3 font-normal">Team</th>
                  <th className="w-36 py-3 font-normal">Power</th>
                  <th className="py-3 text-right font-normal">Record</th>
                  <th className="py-3 text-right font-normal" title="Win rate if you played every team every week">
                    All-play
                  </th>
                  <th className="py-3 text-right font-normal" title="Best possible lineup, projected points per week">
                    Lineup
                  </th>
                  <th className="py-3 text-right font-normal" title={power.dynasty ? "Dynasty value of the roster plus owned picks" : "Trade value of the roster"}>
                    {power.dynasty ? "Dynasty" : "Value"}
                  </th>
                  {POSITIONS.map((p) => (
                    <th key={p} className="w-10 py-3 text-center font-normal">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {power.teams.map((t) => (
                  <tr
                    key={t.team.roster_id}
                    className={`border-b border-line/60 ${t.team.owner_id === myUserId ? "bg-surface-2" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="h-5 w-1 -skew-x-12" style={{ background: managerColor(t.team.owner_id) }} />
                        <span className="score text-xl">{t.rank}</span>
                      </span>
                    </td>
                    <td className="max-w-0 py-2.5 pr-3">
                      <TeamName team={t.team} label={t.label} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ScoreBar score={t.score} />
                    </td>
                    <td className="tabular py-2.5 text-right">
                      {record(t.team)}
                      <span className="ml-1 text-xs text-muted">({ordinal(t.standingRank)})</span>
                    </td>
                    <td className="tabular py-2.5 text-right text-ink-2">
                      {t.allPlayPct == null ? "–" : `${Math.round(t.allPlayPct * 100)}%`}
                    </td>
                    <td className="tabular py-2.5 text-right">
                      {t.lineupPpg.toFixed(1)}
                      <span className="ml-1 text-xs text-muted">({ordinal(t.lineupRank)})</span>
                    </td>
                    <td className="tabular py-2.5 text-right">
                      {ordinal(t.valueRank)}
                    </td>
                    {POSITIONS.map((p) => (
                      <td key={p} className="py-2.5 text-center">
                        <RankChip rank={t.positionRanks[p]} n={n} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div>
          <h2 className="chyron mb-3">Team builds</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {power.teams.map((t) => (
              <BuildCard key={t.team.roster_id} team={t} n={n} dynasty={power.dynasty} mine={t.team.owner_id === myUserId} />
            ))}
          </div>
        </div>

        <p className="text-xs text-muted">
          Lineup: the best starting lineup from each roster, using the site&apos;s rest-of-season projections (kickers and
          defenses aren&apos;t projected yet). {power.dynasty ? "Dynasty" : "Value"}: the trade value of every player
          {power.dynasty ? ", plus the team's rookie picks over the next three drafts" : ""}. Position ranks compare each
          team&apos;s starters and top backup. Projections use standard {format} scoring, not yet this league&apos;s custom rules.
        </p>
      </div>
    </>
  );
}

function BuildCard({ team: t, n, dynasty, mine }: { team: PowerTeam; n: number; dynasty: boolean; mine: boolean }) {
  const ranked = POSITIONS.map((p) => ({ p, rank: t.positionRanks[p] })).sort((a, b) => a.rank - b.rank);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return (
    <section className={`rounded-lg border bg-surface p-4 ${mine ? "border-accent" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span className="score w-7 shrink-0 text-3xl leading-none text-accent italic">{t.rank}</span>
        <div className="min-w-0 flex-1">
          <TeamName team={t.team} label={t.label} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Lineup / wk" value={t.lineupPpg.toFixed(1)} rank={t.lineupRank} />
        <Stat label={dynasty ? "Dynasty" : "Value"} value={Math.round(t.rosterValue + t.pickValue).toString()} rank={t.valueRank} />
        <Stat label="Record" value={record(t.team)} rank={t.standingRank} />
      </dl>
      <p className="mt-3 text-xs text-ink-2">
        {best.rank <= n / 3 ? `Best: ${best.p} room (${ordinal(best.rank)})` : `Strongest: ${best.p} (${ordinal(best.rank)})`}
        {" · "}
        {worst.rank > (2 * n) / 3 ? `Needs help at ${worst.p} (${ordinal(worst.rank)})` : `Weakest: ${worst.p} (${ordinal(worst.rank)})`}
      </p>
      {dynasty && t.pickValue > 0 && (
        <p className="mt-1 text-xs text-muted">Picks add {Math.round(t.pickValue)} of the dynasty value.</p>
      )}
      <h3 className="mt-3 text-xs font-medium text-muted">{dynasty ? "Most valuable" : "Top players"}</h3>
      <ul className="mt-1 space-y-1">
        {t.core.map((p) => (
          <li key={p.playerId} className="flex min-w-0 items-center gap-2 text-sm">
            <PosBadge position={p.position} />
            <span className="flex min-w-0 flex-1 overflow-hidden">
              <PlayerLink id={p.playerId} name={p.name} team={p.team} />
            </span>
            <span className="tabular shrink-0 text-xs text-muted">{p.ppg.toFixed(1)}/wk</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, rank }: { label: string; value: string; rank: number }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className="tabular text-sm font-semibold">{value}</dd>
      <dd className="text-[10px] text-muted">{ordinal(rank)}</dd>
    </div>
  );
}

function TeamName({ team, label }: { team: Team; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamAvatar url={team.avatar_url} name={team.team_name} size={24} colorKey={team.owner_id} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{team.team_name}</span>
        <span className="block truncate text-xs text-muted">
          {team.display_name} · <span className="text-ink-2">{label}</span>
        </span>
      </span>
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(score, 2)}%` }} />
      </span>
      <span className="tabular w-7 text-right text-xs text-ink-2">{Math.round(score)}</span>
    </span>
  );
}

// League rank at a position: top third reads green, bottom third red, with the number always shown
function RankChip({ rank, n }: { rank: number; n: number }) {
  const tone = rank <= n / 3 ? "bg-good/15 text-good" : rank > (2 * n) / 3 ? "bg-critical/15 text-critical" : "bg-surface-2 text-ink-2";
  return <span className={`tabular inline-block w-7 rounded py-0.5 text-center text-xs font-semibold ${tone}`}>{rank}</span>;
}

function record(t: Team) {
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}
