import Link from "next/link";
import { CountUp } from "@/components/landing/CountUp";
import { Reveal } from "@/components/landing/Reveal";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PosBadge } from "@/components/ui";
import { getFormat } from "@/lib/format";
import { getLandingData, type LandingData } from "@/lib/landing";
import { MARKET_CREDIT } from "@/lib/market";
import { safeLoad } from "@/lib/safe";

export default async function LandingPage() {
  const format = await getFormat();
  const { data } = await safeLoad(() => getLandingData(format));

  return (
    <div className="-mt-6">
      <Hero data={data} />
      {data && data.trending.length > 0 && <TrendingRibbon players={data.trending} />}
      {data && <Stats counts={data.counts} />}
      <Features />
      {data && (data.buyLow || data.sellHigh || data.trade) && <MarketSpotlight data={data} />}
      <Pipeline />
      <FinalCta />
    </div>
  );
}

// ──────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────

function Hero({ data }: { data: LandingData | null }) {
  return (
    <section className="relative isolate -mx-4 overflow-hidden px-4 pt-14 pb-10 sm:pt-20">
      <div className="hero-glow" aria-hidden />
      <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div>
          {data && (
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-ink-2" style={{ "--i": 0 } as React.CSSProperties}>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
              Live · {data.season} season, week {data.week}
            </p>
          )}
          <h1 className="rise mt-5 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl" style={{ "--i": 1 } as React.CSSProperties}>
            Fantasy analytics that <span className="text-gradient">show their work.</span>
          </h1>
          <p className="rise mt-5 max-w-xl text-base text-ink-2 sm:text-lg" style={{ "--i": 2 } as React.CSSProperties}>
            Trending players, trade values that blend the real trade market with a production model, start/sit calls, and
            matchup heatmaps, built on four seasons of weekly NFL stats.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ "--i": 3 } as React.CSSProperties}>
            <Link
              href="/overview"
              className="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-110"
            >
              Open the dashboard
              <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                →
              </span>
            </Link>
            <Link
              href="/trade?mode=dynasty"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-3 text-sm font-semibold transition hover:border-accent hover:text-accent"
            >
              Value a trade
            </Link>
          </div>
        </div>

        <div className="rise relative" style={{ "--i": 2 } as React.CSSProperties}>
          {data?.hotPlayer ? <HeroChart player={data.hotPlayer} /> : <HeroPlaceholder />}
          {data?.trade && (
            <div className="float absolute -bottom-6 left-2 hidden rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:block" style={{ "--i": 0 } as React.CSSProperties}>
              <div className="text-muted">Trade verdict</div>
              <div className="font-semibold">{data.trade.label}</div>
            </div>
          )}
          {data?.buyLow && (
            <div className="float absolute -top-4 right-2 hidden items-center gap-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:flex" style={{ "--i": 1 } as React.CSSProperties}>
              <PlayerAvatar id={data.buyLow.playerId} name={data.buyLow.name} size={22} />
              <span className="font-semibold">{data.buyLow.name}</span>
              <span className="font-semibold" style={{ color: "var(--good)" }}>
                ↗ Buy low
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroChart({ player }: { player: NonNullable<LandingData["hotPlayer"]> }) {
  const W = 560;
  const H = 280;
  const pad = { top: 24, right: 20, bottom: 30, left: 20 };
  const pts = player.points;
  const max = Math.max(...pts, 10) * 1.1;
  const band = (W - pad.left - pad.right) / pts.length;
  const barW = Math.min(24, band * 0.5);
  const x = (i: number) => pad.left + band * i + band / 2;
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - Math.max(v, 0) / max);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const base = H - pad.bottom;
  const last = pts.length - 1;
  const r = (v: number) => Math.min(4, barW / 2, base - y(v));

  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-5 shadow-2xl shadow-black/10 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/players/${player.id}`} className="flex items-center gap-3 hover:text-accent">
          <PlayerAvatar id={player.id} name={player.name} size={40} />
          <div>
            <div className="text-xs text-muted">Hottest player right now</div>
            <div className="font-semibold">
              {player.name} <span className="text-xs font-normal text-muted">{player.position} · {player.team ?? "FA"}</span>
            </div>
          </div>
        </Link>
        <div className="text-right">
          <div className="tabular text-lg font-semibold" style={{ color: "var(--good)" }}>
            ▲ {player.delta.toFixed(1)}
          </div>
          <div className="text-[11px] text-muted">last 3 vs. season avg</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${player.name} fantasy points by week: ${pts.map((p) => p.toFixed(1)).join(", ")}`}>
        <line x1={pad.left} x2={W - pad.right} y1={base} y2={base} stroke="var(--axis)" strokeWidth={1} />
        {pts.map((v, i) => (
          <path
            key={i}
            className="grow-y"
            style={{ "--i": i } as React.CSSProperties}
            d={`M${x(i) - barW / 2},${base}V${y(v) + r(v)}Q${x(i) - barW / 2},${y(v)} ${x(i) - barW / 2 + r(v)},${y(v)}H${x(i) + barW / 2 - r(v)}Q${x(i) + barW / 2},${y(v)} ${x(i) + barW / 2},${y(v) + r(v)}V${base}Z`}
            fill="var(--series-1-proj)"
          />
        ))}
        <path className="draw" pathLength={1} d={line} fill="none" stroke="var(--series-1)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle className="pulse-ring" cx={x(last)} cy={y(pts[last])} r={6} fill="var(--series-1)" />
        <circle cx={x(last)} cy={y(pts[last])} r={6} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} className="rise" style={{ "--i": 20 } as React.CSSProperties} />
        <text x={x(last)} y={y(pts[last]) - 14} textAnchor="middle" className="rise fill-ink text-[20px] font-semibold sm:text-[13px]" style={{ "--i": 21 } as React.CSSProperties}>
          {pts[last].toFixed(1)}
        </text>
        {pts.map((_, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[18px] sm:text-[11px]">
            Wk {player.weeks[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

function HeroPlaceholder() {
  return (
    <div className="flex aspect-[2/1] items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 text-sm text-muted">
      Load data to see live charts
    </div>
  );
}

// ──────────────────────────────────────────────
// Trending ribbon
// ──────────────────────────────────────────────

function TrendingRibbon({ players }: { players: LandingData["trending"] }) {
  const items = [...players, ...players]; // doubled so the loop is seamless
  return (
    <section className="-mx-4 mt-6 border-y border-line bg-surface/60 py-3" aria-label="Most added players on Sleeper in the last 24 hours">
      <div className="marquee overflow-hidden">
        <ul className="marquee-track gap-3">
          {items.map((p, i) => (
            <li key={`${p.id}-${i}`} aria-hidden={i >= players.length}>
              <Link
                href={`/players/${p.id}`}
                tabIndex={i >= players.length ? -1 : undefined}
                className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm whitespace-nowrap transition hover:border-accent"
              >
                <PlayerAvatar id={p.id} name={p.name} size={22} />
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">{p.position}</span>
                <span className="tabular text-xs" style={{ color: "var(--good)" }}>
                  +{p.adds.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

function Stats({ counts }: { counts: LandingData["counts"] }) {
  const stats = [
    { value: counts.playerGames, label: "player-games analyzed" },
    { value: counts.players, label: "players tracked" },
    { value: counts.seasons, label: "NFL seasons" },
    { value: counts.marketValues, label: "live market values" },
  ];
  return (
    <Reveal as="section" className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
      {stats.map((s, i) => (
        <div key={s.label} data-stagger style={{ "--i": i } as React.CSSProperties}>
          <div className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <CountUp value={s.value} />
          </div>
          <div className="mt-1 text-sm text-ink-2">{s.label}</div>
        </div>
      ))}
    </Reveal>
  );
}

// ──────────────────────────────────────────────
// Features
// ──────────────────────────────────────────────

const FEATURES = [
  {
    href: "/trending",
    title: "Trending players",
    body: "Waiver adds and drops across Sleeper, who's heating up, and whose snap share is quietly climbing.",
    icon: "M3 17l6-6 4 4 8-8M15 7h6v6",
  },
  {
    href: "/trade",
    title: "Trade calculator",
    body: "Redraft or dynasty, with draft picks. Market value from real trades blended with our production model.",
    icon: "M7 7h13l-3-3M17 17H4l3 3",
  },
  {
    href: "/rankings",
    title: "Rankings & tiers",
    body: "Rest-of-season projections with natural tier breaks, VOR, boom/bust rates, and four seasons of history.",
    icon: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  },
  {
    href: "/start-sit",
    title: "Start / sit",
    body: "Projection, recent form, and opponent strength rolled into one score, with a floor-to-ceiling range.",
    icon: "M5 13l4 4L19 7",
  },
  {
    href: "/matchups",
    title: "Matchup heatmap",
    body: "Fantasy points every defense allows to each position, against league average. Find the streaming spots.",
    icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  },
  {
    href: "/rankings",
    title: "Player profiles",
    body: "Weekly charts with upcoming projections, full game logs, and redraft and dynasty value side by side.",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  },
];

function Features() {
  return (
    <section className="mt-24">
      <Reveal className="reveal-self max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Everything you need on game day</h2>
        <p className="mt-2 text-ink-2">Six tools, one data model. Every number links back to the stats behind it.</p>
      </Reveal>
      <Reveal as="ul" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <li key={f.title} data-stagger style={{ "--i": i } as React.CSSProperties}>
            <Link href={f.href} className="lift group block h-full rounded-xl border border-line bg-surface p-5">
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-accent transition group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{f.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open
                <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </Reveal>
    </section>
  );
}

// ──────────────────────────────────────────────
// Market vs. model spotlight
// ──────────────────────────────────────────────

function MarketSpotlight({ data }: { data: LandingData }) {
  const cards = [
    { p: data.buyLow, label: "Buy low", note: "Production says he's worth more than he costs", color: "var(--good)", icon: "↗" },
    { p: data.sellHigh, label: "Sell high", note: "The market pays more than his production supports", color: "var(--serious)", icon: "↘" },
  ].filter((c) => c.p);

  return (
    <section className="mt-24 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
      <Reveal className="reveal-self">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Two opinions are better than one: <span className="text-gradient">the market and the model.</span>
        </h2>
        <p className="mt-3 text-ink-2">
          Trade values blend what managers actually pay in real trades with what a player's production and age curve say he's worth.
          When the two disagree, that's your edge.
        </p>
        <p className="mt-3 text-xs text-muted">
          Market values from{" "}
          <a href={MARKET_CREDIT.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
            {MARKET_CREDIT.label}
          </a>
          . Dynasty, 12-team, 1QB.
        </p>
      </Reveal>

      <div className="grid gap-4">
        {cards.map(({ p, label, note, color, icon }, i) => (
          <Reveal key={label} className="reveal-self">
            <Link href={`/players/${p!.playerId}`} className="lift block rounded-xl border border-line bg-surface p-5" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <PlayerAvatar id={p!.playerId} name={p!.name} size={44} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PosBadge position={p!.position} />
                    <span className="truncate font-semibold">{p!.name}</span>
                  </div>
                  <div className="text-xs text-muted">{note}</div>
                </div>
                <span className="ml-auto shrink-0 text-sm font-semibold" style={{ color }}>
                  {icon} {label}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                {[
                  { name: "Market", v: p!.market ?? 0, fill: "var(--series-2)" },
                  { name: "Model", v: p!.model ?? 0, fill: "var(--series-1)" },
                ].map((row) => (
                  <div key={row.name} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3">
                    <span className="text-ink-2">{row.name}</span>
                    <div className="h-2 rounded-sm bg-surface-2">
                      <div className="fill h-2 rounded-sm" style={{ "--w": `${row.v}%`, background: row.fill } as React.CSSProperties} />
                    </div>
                    <span className="tabular text-right">{row.v.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </Link>
          </Reveal>
        ))}

        {data.trade && <TradeDemo trade={data.trade} />}
      </div>
    </section>
  );
}

function TradeDemo({ trade }: { trade: NonNullable<LandingData["trade"]> }) {
  const total = trade.sideA + trade.sideB;
  return (
    <Reveal className="reveal-self">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted">Live dynasty trade</span>
          <span className="text-sm font-semibold">{trade.label}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          {[
            { side: trade.a, label: "Team A gets", color: "var(--series-1)" },
            { side: trade.b, label: "Team B gets", color: "var(--series-2)" },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </div>
              <ul className="mt-1.5 space-y-1">
                {s.side.map((a) => (
                  <li key={a.name} className="flex items-center gap-2">
                    {a.id ? (
                      <PlayerAvatar id={a.id} name={a.name} size={20} />
                    ) : (
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-2 text-[8px] font-semibold text-ink-2" aria-hidden>
                        PK
                      </span>
                    )}
                    <span className="truncate">{a.name}</span>
                    <span className="tabular ml-auto text-xs text-muted">{a.value.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-2.5 gap-0.5" role="img" aria-label={`Team A ${trade.sideA.toFixed(1)}, Team B ${trade.sideB.toFixed(1)}`}>
          <div className="fill rounded-l-sm" style={{ "--w": `${(trade.sideA / total) * 100}%`, background: "var(--series-1)" } as React.CSSProperties} />
          <div className="fill rounded-r-sm" style={{ "--w": `${(trade.sideB / total) * 100}%`, background: "var(--series-2)" } as React.CSSProperties} />
        </div>
        <Link href="/trade?mode=dynasty" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">
          Build your own trade →
        </Link>
      </div>
    </Reveal>
  );
}

// ──────────────────────────────────────────────
// How it works
// ──────────────────────────────────────────────

const STEPS = [
  { title: "Sleeper API", body: "Weekly stats, projections, and waiver trends" },
  { title: "PostgreSQL", body: "Scoring, ranks, and consistency computed in SQL views" },
  { title: "Model + market", body: "Age curves, VOR, and real trade prices, blended" },
  { title: "Your decisions", body: "Start, sit, add, drop, buy, sell" },
];

function Pipeline() {
  return (
    <section className="mt-24">
      <Reveal className="reveal-self text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <p className="mt-2 text-ink-2">From raw box scores to a recommendation, with every step inspectable.</p>
      </Reveal>
      <Reveal as="ol" className="relative mt-10 grid gap-6 sm:grid-cols-4">
        <svg className="pointer-events-none absolute top-6 right-[12.5%] left-[12.5%] hidden h-2 w-3/4 sm:block" preserveAspectRatio="none" viewBox="0 0 100 2" aria-hidden>
          <line x1="0" y1="1" x2="100" y2="1" stroke="var(--series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" className="flow" opacity="0.7" />
        </svg>
        {STEPS.map((s, i) => (
          <li key={s.title} data-stagger style={{ "--i": i } as React.CSSProperties} className="relative text-center">
            <span className="relative z-10 mx-auto flex size-12 items-center justify-center rounded-full border border-line bg-surface text-sm font-semibold text-accent shadow-sm">
              {i + 1}
            </span>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-sm text-ink-2">{s.body}</p>
          </li>
        ))}
      </Reveal>
    </section>
  );
}

function FinalCta() {
  return (
    <Reveal className="reveal-self relative isolate mt-24 mb-8 overflow-hidden rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <div className="hero-glow opacity-70" aria-hidden />
      <div className="relative z-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">Your league won&apos;t see it coming.</h2>
        <p className="mx-auto mt-3 max-w-lg text-ink-2">Built on open NFL data from Sleeper, plus live trade-market values.</p>
        <Link
          href="/overview"
          className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-110"
        >
          Open the dashboard
          <span className="transition-transform group-hover:translate-x-1" aria-hidden>
            →
          </span>
        </Link>
      </div>
    </Reveal>
  );
}
