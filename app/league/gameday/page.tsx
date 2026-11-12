import Link from "next/link";
import { AutoRefresh, LocalTime } from "@/components/gameday/Live";
import { LeagueTabs } from "@/components/leagues/LeagueHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SetupNotice } from "@/components/SetupNotice";
import { TeamAvatar } from "@/components/TeamAvatar";
import { Card, Empty, InjuryTag, PosBadge, Segmented } from "@/components/ui";
import { getGameday, type GamedayGame, type GamedayPlayer, type LeagueMatchup } from "@/lib/gameday";
import { safeLoad } from "@/lib/safe";

export const metadata = { title: "Gameday" };

export default async function GamedayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const params = await searchParams;
  const result = await safeLoad(getGameday);
  if (result.error != null) return <SetupNotice error={result.error} />;
  const g = result.data;

  const header = (
    <div className="mb-6">
      <p className="text-sm text-ink-2">
        {g.season} season · Week {g.week}
        {g.leagueCount > 0 && ` · ${g.leagueCount} ${g.leagueCount === 1 ? "league" : "leagues"}`}
      </p>
      <h1 className="text-xl font-semibold tracking-tight">Your gameday</h1>
      <LeagueTabs tab="gameday" />
    </div>
  );

  if (!g.userId || g.leagueCount === 0) {
    return (
      <>
        {header}
        <Card>
          <Empty>
            {g.userId ? "You don't have a team in any of your leagues yet." : "Gameday shows your starters across all your leagues."}{" "}
            <Link href="/leagues" className="text-accent hover:underline">
              Find your leagues by Sleeper username
            </Link>{" "}
            to get started.
          </Empty>
        </Card>
      </>
    );
  }

  const day = pickDay(g.days, params.day);
  const games = g.games.filter((x) => x.date === day);
  const withPlayers = games.filter((x) => x.mine.length > 0 || x.against.length > 0);
  const quiet = games.filter((x) => x.mine.length === 0 && x.against.length === 0);
  const live = g.games.some((x) => x.status === "in_game");

  return (
    <>
      {live && <AutoRefresh seconds={60} />}
      {header}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {g.matchups.map((m) => (
          <MatchupCard key={m.leagueId} matchup={m} />
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          items={g.days.map((d) => ({
            href: `/league/gameday?day=${d}`,
            label: `${dayLabel(d)} (${countMine(g.games, d)})`,
            active: d === day,
          }))}
        />
        <p className="text-xs text-muted">
          {live ? "Live · updates every minute" : "Points and projections in each league's scoring"}
        </p>
      </div>

      {withPlayers.length === 0 ? (
        <Card>
          <Empty>None of your starters or opponents play on {dayLabel(day)}.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {withPlayers.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {quiet.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          No one in your matchups plays in: {quiet.map((x) => `${x.away} @ ${x.home}`).join(", ")}
        </p>
      )}

      {g.notPlaying.length > 0 && (
        <Card title="Not playing this week" subtitle="Starters on bye or without a team" className="mt-4">
          <PlayerList players={g.notPlaying} showProjection={false} />
        </Card>
      )}
    </>
  );
}

function MatchupCard({ matchup: m }: { matchup: LeagueMatchup }) {
  const ahead = m.opponent ? m.me.projected >= m.opponent.projected : true;
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        <TeamAvatar url={m.avatar} name={m.leagueName} size={18} />
        <span className="truncate">{m.leagueName}</span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <span className="truncate font-semibold">{m.me.teamName}</span>
        <span className="tabular text-right font-semibold">{m.me.points.toFixed(2)}</span>
        <span className="truncate text-ink-2">{m.opponent?.teamName ?? "No opponent this week"}</span>
        <span className="tabular text-right text-ink-2">{m.opponent ? m.opponent.points.toFixed(2) : ""}</span>
      </div>
      {m.opponent && (
        <p className="mt-2 text-xs text-muted">
          Projected{" "}
          <span className={`tabular font-medium ${ahead ? "text-good" : "text-critical"}`}>
            {m.me.projected.toFixed(1)}–{m.opponent.projected.toFixed(1)}
          </span>
        </p>
      )}
      {m.warnings.map((w) => (
        <p key={w} className="mt-1 text-xs font-medium text-critical">
          ⚠ {w}
        </p>
      ))}
    </section>
  );
}

function GameCard({ game }: { game: GamedayGame }) {
  return (
    <section className={`rounded-lg border bg-surface ${game.status === "in_game" ? "border-accent" : "border-line"}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{game.away}</span>
          {game.awayScore != null && <span className="tabular">{game.awayScore}</span>}
          <span className="font-normal text-muted">@</span>
          <span>{game.home}</span>
          {game.homeScore != null && <span className="tabular">{game.homeScore}</span>}
        </div>
        <span className="text-xs text-ink-2">
          {game.status === "complete" ? (
            "Final"
          ) : game.status === "in_game" ? (
            <span className="font-semibold text-accent">
              {game.quarter ? `Q${game.quarter}` : "Live"} {game.clock ?? ""}
            </span>
          ) : (
            <>
              <LocalTime iso={game.kickoff} />
              {game.channel && ` · ${game.channel}`}
            </>
          )}
        </span>
      </header>
      <div className="p-4">
        {game.mine.length > 0 ? (
          <>
            <h3 className="mb-1 flex justify-between text-xs font-medium text-muted">
              Your starters
              <span className="font-normal">{game.status === "complete" ? "pts" : "pts / proj"}</span>
            </h3>
            <PlayerList players={game.mine} showProjection={game.status !== "complete"} />
          </>
        ) : (
          <p className="text-sm text-muted">None of your starters in this one.</p>
        )}
        {game.against.length > 0 && (
          <>
            <h3 className="mt-4 mb-1 text-xs font-medium text-muted">Against you</h3>
            <PlayerList players={game.against} showProjection={game.status !== "complete"} muted />
          </>
        )}
      </div>
    </section>
  );
}

function PlayerList({ players, showProjection, muted }: { players: GamedayPlayer[]; showProjection: boolean; muted?: boolean }) {
  return (
    <ul className="divide-y divide-line/60">
      {players.map((p) => (
        <li key={p.playerId} className={`flex items-start gap-3 py-2 ${muted ? "opacity-80" : ""}`}>
          <PlayerAvatar id={p.playerId} name={p.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-medium">{p.name}</span>
              <InjuryTag status={p.injuryStatus} />
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <PosBadge position={p.position ?? "?"} />
              {p.team ?? "FA"}
              {p.leagues.length > 1 && <span className="font-medium text-ink-2">· {p.leagues.length} leagues</span>}
            </p>
          </div>
          <ul className="shrink-0 space-y-0.5 text-right text-xs">
            {p.leagues.map((l) => (
              <li key={l.leagueId} className="flex items-center justify-end gap-2">
                <span className="max-w-32 truncate text-muted">{l.leagueName}</span>
                <span className="tabular w-10 font-semibold text-ink">{l.points.toFixed(1)}</span>
                {showProjection && (
                  <span className="tabular w-12 text-muted">{l.projected != null ? `/ ${l.projected.toFixed(1)}` : ""}</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// Today if there are games today (Eastern time, like the schedule), else the next game day
function pickDay(days: string[], requested?: string) {
  if (requested && days.includes(requested)) return requested;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return days.find((d) => d >= today) ?? days.at(-1) ?? today;
}

function dayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function countMine(games: GamedayGame[], day: string) {
  return games.filter((g) => g.date === day).reduce((n, g) => n + g.mine.length, 0);
}
