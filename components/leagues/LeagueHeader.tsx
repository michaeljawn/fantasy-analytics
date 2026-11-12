import Link from "next/link";
import { LeagueSwitcher } from "@/components/leagues/LeagueSwitcher";
import { TeamAvatar } from "@/components/TeamAvatar";
import { TeamPicker } from "@/components/TeamPicker";
import type { LeagueInfo, Team } from "@/lib/league";

const TABS = [
  { id: "standings", label: "Standings", href: "/league" },
  { id: "power", label: "Power rankings", href: "/league/power" },
  { id: "paper", label: "League paper", href: "/league/news" },
] as const;

// Shared by the league pages: league name, switcher, my-team picker, and tabs
export function LeagueHeader({
  league,
  leagues,
  teams,
  myUserId,
  tab,
}: {
  league: LeagueInfo;
  leagues: { league_id: string; name: string }[];
  teams: Team[];
  myUserId: string | null;
  tab: (typeof TABS)[number]["id"];
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
          <LeagueSwitcher leagues={leagues} value={league.league_id} />
          <TeamPicker teams={teams} value={teams.some((t) => t.owner_id === myUserId) ? myUserId : null} />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {league.tags.map((t) => (
          <li key={t} className="rounded border border-line px-2 py-0.5 text-xs text-ink-2">
            {t}
          </li>
        ))}
      </ul>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${
              t.id === tab ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function weekStatus(league: LeagueInfo) {
  if (league.status === "complete") return "Final";
  if (league.status !== "in_season") return "Preseason";
  return league.currentWeek >= league.playoffWeekStart ? `Playoffs, week ${league.currentWeek}` : `Week ${league.currentWeek}`;
}
