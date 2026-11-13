"use client";

import { useEffect, useRef, useState } from "react";

// Scoreboard motion for Gameday. The page refreshes every minute during games; these components
// remember the last values they showed, so a change between refreshes animates instead of jumping.

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A number that counts up (or down) to its new value and flashes when it rises
export function LiveNumber({
  value,
  digits = 1,
  className = "",
  bad = false,
}: {
  value: number;
  digits?: number;
  className?: string;
  bad?: boolean; // a rise is bad news (points against you), so flash red
}) {
  const prev = useRef(value);
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(0); // bumps on each rise, to restart the animation

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    if (value > from) setFlash((n) => n + 1);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min((now - start) / 900, 1);
      setShown(from + (value - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span key={flash} className={`${className} ${flash ? (bad ? "flash-up flash-bad" : "flash-up") : ""}`}>
      {shown.toFixed(digits)}
    </span>
  );
}

type Play = { id: number; kind: "td" | "big"; delta: number };

// A player row that celebrates a touchdown or big play between refreshes. A touchdown is a
// jump of 4+ points while the player's team scores 6+; a big play is any other jump of 5+.
export function PlayRow({
  points,
  teamScore,
  against = false,
  colors,
  className = "",
  children,
}: {
  points: number;
  teamScore: number | null;
  against?: boolean;
  colors?: [string, string];
  className?: string;
  children: React.ReactNode;
}) {
  const prev = useRef({ points, teamScore });
  const teamTdAt = useRef(0); // when the team last scored 6+
  const [play, setPlay] = useState<Play | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = { points, teamScore };
    const delta = points - before.points;
    const scored = teamScore != null && before.teamScore != null ? teamScore - before.teamScore : 0;
    if (scored >= 6) teamTdAt.current = Date.now();
    // Scores and player points come from different Sleeper feeds and can land a refresh apart
    const teamJustScored = Date.now() - teamTdAt.current < 150_000;
    const kind = delta >= 4 && teamJustScored ? "td" : delta >= 5 ? "big" : null;
    if (!kind) return;
    setPlay({ id: Date.now(), kind, delta });
    const t = setTimeout(() => setPlay(null), 3600);
    return () => clearTimeout(t);
  }, [points, teamScore]);

  const tone = against ? "var(--critical)" : "var(--good)";
  const label = play?.kind === "td" ? (against ? "TD against you" : "Touchdown") : against ? "Big play against you" : "Big play";

  return (
    <li className={`relative ${className}`}>
      {play && <span key={`f${play.id}`} aria-hidden className="row-flash pointer-events-none absolute inset-0 -mx-2 rounded" style={{ "--flash": tone } as React.CSSProperties} />}
      {children}
      {play && (
        <>
          {!against && play.kind === "td" && <Burst key={`b${play.id}`} colors={colors} />}
          <span
            key={`l${play.id}`}
            role="status"
            className="play-badge slant absolute inset-y-0 left-11 z-10 my-auto h-fit px-3 py-1 font-display text-sm font-extrabold tracking-wide whitespace-nowrap uppercase italic"
            style={{ background: against ? "var(--critical)" : "var(--accent)", color: against ? "#fff" : "var(--on-accent)" }}
          >
            {label} +{play.delta.toFixed(1)}
          </span>
        </>
      )}
    </li>
  );
}

// Slanted confetti bars bursting out of the player's photo, in his team's colors
function Burst({ colors }: { colors?: [string, string] }) {
  const palette = [colors?.[0] ?? "var(--accent)", colors?.[1] ?? "var(--good)", "var(--accent)"];
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 z-10">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="burst-bar"
          style={
            {
              "--a": `${(360 / 14) * i}deg`,
              "--d": `${38 + (i % 3) * 12}px`,
              background: palette[i % palette.length],
              animationDelay: `${(i % 4) * 30}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
