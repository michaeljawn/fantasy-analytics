import Link from "next/link";
import { AddById, FindLeagues } from "@/components/leagues/AddLeague";
import { SetupNotice } from "@/components/SetupNotice";
import { TeamAvatar } from "@/components/TeamAvatar";
import { Card, Empty, PageHeader } from "@/components/ui";
import { getLeagueId, getMyLeagues } from "@/lib/league";
import { safeLoad } from "@/lib/safe";
import { removeLeague, switchLeague } from "./actions";

export const metadata = { title: "Your leagues" };

export default async function LeaguesPage() {
  const result = await safeLoad(async () => {
    const [leagues, activeId] = await Promise.all([getMyLeagues(), getLeagueId()]);
    return { leagues, activeId };
  });
  if (result.error != null) return <SetupNotice error={result.error} />;
  const { leagues, activeId } = result.data;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Your leagues"
        description="Add your Sleeper leagues and switch between them. Your list is saved in this browser; everyone in a league sees the same standings and paper."
      />

      <div className="grid gap-4">
        <Card title="Leagues">
          {leagues.length === 0 ? (
            <Empty>No leagues yet. Add one below.</Empty>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {leagues.map((l) => {
                const active = l.league_id === activeId;
                return (
                  <li key={l.league_id} className="flex flex-wrap items-center gap-3 py-3">
                    <TeamAvatar url={l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null} name={l.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-muted">
                        {l.season} · {l.total_rosters} teams
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {active ? (
                        <Link href="/league" className="rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent">
                          Showing
                        </Link>
                      ) : (
                        <form action={switchLeague.bind(null, l.league_id)}>
                          <button className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent">
                            Switch to
                          </button>
                        </form>
                      )}
                      <form action={removeLeague.bind(null, l.league_id)}>
                        <button className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-critical">Remove</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Find your leagues" subtitle="Search by Sleeper username. This also picks your team in each league.">
          <FindLeagues myLeagueIds={leagues.map((l) => l.league_id)} />
        </Card>

        <Card title="Add by league ID" subtitle="The number at the end of your league's URL on sleeper.com.">
          <AddById />
        </Card>
      </div>
    </div>
  );
}
