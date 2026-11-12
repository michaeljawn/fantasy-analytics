import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamAvatar } from "@/components/TeamAvatar";
import type { Edition as EditionData, PlayerLine, Preview, Result, StandingRow, Story, TeamRef } from "@/lib/newspaper/types";
import { bodyFont, headFont, mastFont } from "./fonts";

type Props = {
  edition: EditionData;
  publishedAt: Date;
  writer: string;
  archive: { week: number; headline: string }[];
};

export function Edition({ edition, publishedAt, writer, archive }: Props) {
  const { facts, stories } = edition;
  const results = new Map(facts.results.map((r) => [r.matchup_id, r]));
  const previews = new Map(facts.previews.map((p) => [p.matchup_id, p]));
  const lead = results.get(stories.lead.matchup_id)!;
  const weeks = archive.map((a) => a.week);
  const prev = weeks.filter((w) => w < facts.week).sort((a, b) => b - a)[0];
  const next = weeks.filter((w) => w > facts.week).sort((a, b) => a - b)[0];
  const published = publishedAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <article
      className={`paper ${mastFont.variable} ${headFont.variable} ${bodyFont.variable} -mx-4 px-4 py-6 sm:mx-0 sm:rounded-sm sm:px-8 sm:py-8 sm:shadow-sm`}
    >
      {/* ── Masthead ── */}
      <header className="text-center">
        <div className="kicker flex flex-wrap items-center justify-between gap-2 border-b hair pb-2 text-[var(--paper-ink-2)]">
          <span>
            {facts.league.season} Season · No. {facts.week}
          </span>
          <span className="hidden sm:inline">All the news that fits the waiver wire</span>
          <span>{published}</span>
        </div>
        <h1 className="masthead mt-4 text-[clamp(2.4rem,8vw,5.5rem)]">The {facts.league.name}</h1>
        <div className="rule-double mt-4" />
        <nav className="kicker flex items-center justify-between gap-2 py-2 text-[var(--paper-ink-2)]">
          {prev ? <Link href={`/league/news/${prev}`} className="hover:text-[var(--paper-accent)]">← Week {prev}</Link> : <span />}
          <span>Week {facts.week} edition</span>
          {next ? <Link href={`/league/news/${next}`} className="hover:text-[var(--paper-accent)]">Week {next} →</Link> : <span />}
        </nav>
        <div className="rule" />
      </header>

      {/* ── Front page: lead story + scoreboard and standings ── */}
      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-8">
          <p className="kicker text-[var(--paper-accent)]">{kicker(lead)}</p>
          <h2 className="headline mt-2 text-[clamp(2rem,4.5vw,3.4rem)]">{stories.lead.headline}</h2>
          {stories.lead.deck && <p className="mt-3 text-lg italic text-[var(--paper-ink-2)]">{stories.lead.deck}</p>}
          <Byline />
          <BoxScore result={lead} />
          <div className="mt-4 gap-8 text-[1.02rem] leading-relaxed sm:columns-2">
            {stories.lead.body.map((p, i) => (
              <p key={i} className={`mb-3 ${i === 0 ? "dropcap" : ""}`}>
                {p}
              </p>
            ))}
          </div>
        </section>

        <aside className="min-w-0 space-y-8 lg:col-span-4 lg:border-l lg:hair lg:pl-8">
          <Scoreboard results={facts.results} />
          <Standings rows={facts.standings} playoffTeams={facts.league.playoffTeams} />
        </aside>
      </div>

      {/* ── Stars, duds, awards ── */}
      <div className="rule-double mt-8" />
      <div className="grid gap-8 py-6 md:grid-cols-3 [&>*]:min-w-0">
        <PlayerList title="Stars of the Week" players={facts.stars} />
        <PlayerList title="Duds" players={facts.duds} versusAverage empty="No big letdowns this week." />
        <Awards facts={facts} />
      </div>

      {/* ── Around the league + other recaps ── */}
      <div className="rule" />
      <div className="grid gap-8 py-6 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-4">
          <SectionHead>{stories.column.headline}</SectionHead>
          <div className="space-y-3 leading-relaxed">
            {stories.column.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <TransactionWire facts={facts} />
        </section>
        <section className="min-w-0 lg:col-span-8 lg:border-l lg:hair lg:pl-8">
          <SectionHead>Results</SectionHead>
          <div className="gap-8 sm:columns-2">
            {stories.recaps.map((s) => (
              <Recap key={s.matchup_id} story={s} result={results.get(s.matchup_id)!} />
            ))}
          </div>
        </section>
      </div>

      {/* ── Next week ── */}
      {facts.nextWeek && stories.previews.length > 0 && (
        <>
          <div className="rule-double" />
          <section className="py-6">
            <SectionHead>Coming Up: Week {facts.nextWeek}</SectionHead>
            <p className="-mt-2 mb-4 text-sm italic text-[var(--paper-ink-2)]">
              Projections use each team&apos;s lineup and Sleeper&apos;s projected stats as of publishing, scored with this
              league&apos;s rules.
            </p>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {stories.previews.map((s) => (
                <PreviewStory key={s.matchup_id} story={s} preview={previews.get(s.matchup_id)!} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Footer and archive ── */}
      <footer className="rule pt-4 text-sm text-[var(--paper-ink-2)]">
        {archive.length > 1 && (
          <div className="mb-4">
            <p className="kicker mb-2">Back issues</p>
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {archive.map((a) => (
                <li key={a.week} className={a.week === facts.week ? "font-semibold" : ""}>
                  <Link href={`/league/news/${a.week}`} className="hover:text-[var(--paper-accent)] hover:underline">
                    Week {a.week}: {a.headline}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-[var(--paper-faint)]">
          Every score, stat, and projection is computed from the league&apos;s Sleeper data.{" "}
          {writer === "template" ? "Stories are written from templates." : "Stories are written by Claude from those facts."}{" "}
          Published once and never edited, so everyone reads the same paper.
        </p>
      </footer>
    </article>
  );
}

// ──────────────────────────────────────────────
// Pieces
// ──────────────────────────────────────────────

function kicker(r: Result) {
  return {
    upset: "Upset of the week",
    nailbiter: "Game of the week",
    blowout: "Blowout of the week",
    shootout: "Shootout of the week",
    slugfest: "Game of the week",
    standard: "Game of the week",
  }[r.storyline];
}

function Byline() {
  return <p className="kicker mt-4 border-y hair py-2 text-[var(--paper-ink-2)]">By the Press Box staff</p>;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h2 className="headline mb-4 border-b-2 border-[var(--paper-rule)] pb-1 text-2xl">{children}</h2>;
}

function Team({ team, size = 22 }: { team: TeamRef; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TeamAvatar url={team.avatar_url} name={team.name} size={size} />
      <span className="truncate">{team.name}</span>
    </span>
  );
}

function BoxScore({ result }: { result: Result }) {
  return (
    <div className="mt-5 border hair p-3 text-sm">
      {[result.winner, result.loser].map((s, i) => (
        <div key={s.team.roster_id} className={`py-1.5 ${i ? "border-t hair" : ""}`}>
          <div className="flex items-center gap-3">
            <span className={`min-w-0 flex-1 ${i ? "" : "font-bold"}`}>
              <Team team={s.team} />
            </span>
            <span className="text-xs text-[var(--paper-faint)]">{s.record}</span>
            <span className={`w-16 text-right text-lg tabular-nums ${i ? "" : "font-bold"}`}>{s.points.toFixed(2)}</span>
          </div>
          <p className="mt-0.5 truncate pl-8 text-xs text-[var(--paper-ink-2)]">
            {s.top.map((p) => `${p.name} ${p.points.toFixed(1)}`).join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

function Scoreboard({ results }: { results: Result[] }) {
  return (
    <section>
      <SectionHead>Scoreboard</SectionHead>
      <ul className="space-y-2 text-sm">
        {results.map((r) => (
          <li key={r.matchup_id} className="border-b hair pb-2">
            {[r.winner, r.loser].map((s, i) => (
              <div key={s.team.roster_id} className={`flex items-center gap-2 ${i ? "text-[var(--paper-ink-2)]" : "font-semibold"}`}>
                <span className="min-w-0 flex-1">
                  <Team team={s.team} size={18} />
                </span>
                <span className="tabular-nums">{s.points.toFixed(2)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Standings({ rows, playoffTeams }: { rows: StandingRow[]; playoffTeams: number }) {
  return (
    <section>
      <SectionHead>Standings</SectionHead>
      <table className="w-full table-fixed text-sm">
        <thead className="kicker text-left text-[var(--paper-faint)]">
          <tr>
            <th className="pb-1 font-bold">Team</th>
            <th className="w-11 pb-1 text-right font-bold">W-L</th>
            <th className="w-11 pb-1 text-right font-bold">PF</th>
            <th className="w-8 pb-1 text-right font-bold" title="Change since last week">
              <span className="sr-only">Change</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const move = s.prevRank == null ? 0 : s.prevRank - s.rank;
            return (
              <tr key={s.team.roster_id} className={s.rank === playoffTeams ? "border-b border-dashed border-[var(--paper-rule)]" : "border-b hair"}>
                <td className="max-w-0 py-1 pr-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-[var(--paper-faint)]">{s.rank}</span>
                    <span className="truncate">{s.team.name}</span>
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">
                  {s.wins}-{s.losses}
                  {s.ties ? `-${s.ties}` : ""}
                </td>
                <td className="py-1 text-right tabular-nums text-[var(--paper-ink-2)]">{s.pointsFor.toFixed(0)}</td>
                <td className="py-1 text-right text-xs tabular-nums" title={move ? `${move > 0 ? "Up" : "Down"} ${Math.abs(move)} from last week` : "No change"}>
                  {move > 0 ? <span className="text-[var(--paper-up)]">▲{move}</span> : move < 0 ? <span className="text-[var(--paper-accent)]">▼{-move}</span> : <span className="text-[var(--paper-faint)]">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs italic text-[var(--paper-faint)]">Dashed line: playoff cut (top {playoffTeams})</p>
    </section>
  );
}

function PlayerList({
  title,
  players,
  versusAverage,
  empty,
}: {
  title: string;
  players: (PlayerLine & { team: TeamRef })[];
  versusAverage?: boolean;
  empty?: string;
}) {
  return (
    <section>
      <SectionHead>{title}</SectionHead>
      {players.length === 0 ? (
        <p className="italic text-[var(--paper-ink-2)]">{empty}</p>
      ) : (
        <ol className="space-y-2.5">
          {players.map((p) => (
            <li key={p.player_id} className="flex items-center gap-3">
              <PlayerAvatar id={p.player_id} name={p.name} size={34} />
              <span className="min-w-0 flex-1 leading-tight">
                <Link href={`/players/${p.player_id}`} className="block truncate font-semibold hover:underline">
                  {p.name}
                </Link>
                <span className="block truncate text-xs text-[var(--paper-ink-2)]">
                  {p.position} · {p.team.name}
                </span>
              </span>
              <span className="text-right leading-tight">
                <span className="block text-lg font-bold tabular-nums">{p.points.toFixed(1)}</span>
                {versusAverage && p.avg != null && (
                  <span className="block text-xs tabular-nums text-[var(--paper-accent)]">avg {p.avg.toFixed(1)}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Awards({ facts }: { facts: EditionData["facts"] }) {
  const a = facts.awards;
  const items = [
    { label: "High score", value: `${a.high.team.name}, ${a.high.points.toFixed(2)}` },
    { label: "Low score", value: `${a.low.team.name}, ${a.low.points.toFixed(2)}` },
    { label: "Biggest blowout", value: `${a.blowout.winner.name} over ${a.blowout.loser.name} by ${a.blowout.margin.toFixed(2)}` },
    { label: "Closest game", value: `${a.closest.winner.name} over ${a.closest.loser.name} by ${a.closest.margin.toFixed(2)}` },
    a.luckiestWin && { label: "Luckiest win", value: `${a.luckiestWin.team.name}, won with ${a.luckiestWin.points.toFixed(2)}` },
    a.unluckiestLoss && { label: "Toughest loss", value: `${a.unluckiestLoss.team.name}, lost with ${a.unluckiestLoss.points.toFixed(2)}` },
  ].filter((x): x is { label: string; value: string } => !!x);

  return (
    <section>
      <SectionHead>The Awards</SectionHead>
      <dl className="space-y-2.5">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="kicker text-[var(--paper-accent)]">{i.label}</dt>
            <dd className="leading-snug">{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TransactionWire({ facts }: { facts: EditionData["facts"] }) {
  if (facts.trades.length === 0 && facts.claims.length === 0) return null;
  return (
    <div className="mt-6 border-t-2 border-[var(--paper-rule)] pt-3">
      <h3 className="kicker mb-3">Transaction wire</h3>
      {facts.trades.map((t, i) => (
        <div key={i} className="mb-3 text-sm">
          <p className="font-semibold">Trade</p>
          {t.sides.map((s) => (
            <p key={s.team.roster_id} className="text-[var(--paper-ink-2)]">
              <span className="text-[var(--paper-ink)]">{s.team.name}</span> gets {s.gets.length ? s.gets.join(", ") : "nothing"}
            </p>
          ))}
        </div>
      ))}
      {facts.claims.length > 0 && (
        <ul className="space-y-1 text-sm">
          {facts.claims.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{c.player}</span>{" "}
                <span className="text-xs text-[var(--paper-faint)]">{c.position}</span> to {c.team.name}
              </span>
              <span className="tabular-nums text-[var(--paper-ink-2)]">{c.bid != null ? `$${c.bid}` : "FA"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Recap({ story, result }: { story: Story; result: Result }) {
  return (
    <div className="mb-6 break-inside-avoid">
      <h3 className="headline text-xl">{story.headline}</h3>
      <p className="mt-1 text-xs tabular-nums text-[var(--paper-ink-2)]">
        <span className="font-semibold text-[var(--paper-ink)]">
          {result.winner.team.name} {result.winner.points.toFixed(2)}
        </span>
        , {result.loser.team.name} {result.loser.points.toFixed(2)}
      </p>
      {story.body.map((p, i) => (
        <p key={i} className="mt-2 leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

function PreviewStory({ story, preview }: { story: Story; preview: Preview }) {
  const pct = Math.round(preview.winProb * 100);
  // Favorite first, so the bar below reads as the favorite's share
  const sides = [...preview.sides].sort((a) => (a.team.roster_id === preview.favorite ? -1 : 1));
  return (
    <div className="border-t hair pt-3">
      <div className="space-y-1.5 text-sm">
        {sides.map((s) => {
          const fav = s.team.roster_id === preview.favorite;
          return (
            <div key={s.team.roster_id} className="flex items-center gap-2">
              <span className={`min-w-0 flex-1 ${fav ? "font-semibold" : ""}`}>
                <Team team={s.team} size={20} />
              </span>
              <span className="text-xs text-[var(--paper-faint)]">{s.record}</span>
              <span className="w-12 text-right tabular-nums">{s.projected.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      {/* Win probability as a split bar: favorite in green, underdog in red */}
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--paper-accent)]" title={`${pct}% favorite`}>
        <div className="bg-[var(--paper-up)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="kicker mt-1 text-[var(--paper-faint)]">
        {sides[0].team.name} {pct}% to win
      </p>
      {story.body.map((p, i) => (
        <p key={i} className="mt-2 text-sm leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}
