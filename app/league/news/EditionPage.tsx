import { notFound } from "next/navigation";
import { LeagueHeader } from "@/components/leagues/LeagueHeader";
import { Edition } from "@/components/newspaper/Edition";
import { SetupNotice } from "@/components/SetupNotice";
import { getLeague, getLeagueId, getMyUserId, getSwitcherLeagues, getTeams } from "@/lib/league";
import { getEdition, listEditions } from "@/lib/newspaper/queries";
import { safeLoad } from "@/lib/safe";

// Shared by /league/news (latest edition) and /league/news/[week]
export async function EditionPage({ week }: { week?: number }) {
  const result = await safeLoad(async () => {
    const leagueId = await getLeagueId();
    const league = leagueId ? await getLeague(leagueId) : null;
    if (!league) return null;
    const [edition, archive, teams, myUserId, switcher] = await Promise.all([
      getEdition(league.league_id, week),
      listEditions(league.league_id),
      getTeams(league.league_id),
      getMyUserId(),
      getSwitcherLeagues(league),
    ]);
    return { league, edition, archive, teams, myUserId, switcher };
  });

  if (result.error != null) return <SetupNotice error={result.error} />;
  if (!result.data) return <NoEditions />;
  const { league, edition, archive, teams, myUserId, switcher } = result.data;
  if (!edition && week != null) notFound();

  return (
    <>
      <LeagueHeader league={league} leagues={switcher} teams={teams} myUserId={myUserId} tab="paper" />
      {edition ? (
        <div className="mx-auto max-w-6xl">
          <Edition edition={edition.content} publishedAt={edition.published_at} writer={edition.writer} archive={archive} />
        </div>
      ) : (
        <NoEditions />
      )}
    </>
  );
}

function NoEditions() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6">
      <h1 className="text-base font-semibold">No editions published yet</h1>
      <p className="mt-2 text-sm text-ink-2">
        The league paper comes out after each week&apos;s games are final, so the first edition arrives after week 1.
      </p>
    </div>
  );
}
