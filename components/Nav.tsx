"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/league", label: "League" },
  { href: "/trending", label: "Trending" },
  { href: "/rankings", label: "Rankings" },
  { href: "/start-sit", label: "Start/Sit" },
  { href: "/trade", label: "Trade" },
  { href: "/matchups", label: "Matchups" },
];

// Main nav with a volt indicator that slides to the active page
export function Nav() {
  const pathname = usePathname();
  const active = LINKS.findIndex((l) => pathname.startsWith(l.href));
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active];
      setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <nav className="relative -mx-1 flex max-w-full gap-0.5 overflow-x-auto">
      {LINKS.map((l, i) => (
        <Link
          key={l.href}
          href={l.href}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`relative px-2.5 py-2 font-display text-[15px] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors ${
            i === active ? "text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
      <span
        aria-hidden
        className="nav-indicator pointer-events-none absolute bottom-0 h-[3px] -skew-x-[24deg] rounded-full bg-accent"
        style={bar ? { left: bar.left + 8, width: bar.width - 16, opacity: 1 } : { left: 0, width: 0, opacity: 0 }}
      />
    </nav>
  );
}

// Standout button for Gameday; the dot pulses while NFL games are live
export function GamedayButton({ liveGames, className = "" }: { liveGames: number; className?: string }) {
  const active = usePathname().startsWith("/gameday");
  const live = liveGames > 0;
  return (
    <Link
      href="/gameday"
      title={live ? `${liveGames} ${liveGames === 1 ? "game" : "games"} live now` : "Your starters across all your leagues"}
      className={`group shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 font-display text-sm font-bold tracking-wide uppercase transition ${
        active
          ? "border-accent bg-accent text-on-accent shadow-[0_0_20px_-4px_var(--accent-glow)]"
          : "border-accent/40 bg-accent/10 text-accent hover:border-accent hover:bg-accent hover:text-on-accent hover:shadow-[0_0_20px_-4px_var(--accent-glow)]"
      } ${className}`}
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />}
        <span className={`relative inline-flex size-2 rounded-full bg-current ${live ? "" : "opacity-50"}`} />
      </span>
      Gameday
      {live && <span className="font-semibold opacity-80">· Live</span>}
    </Link>
  );
}
