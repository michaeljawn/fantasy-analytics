"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayerPicker, type PickablePlayer } from "@/components/PlayerPicker";
import { InjuryTag, PlayerLink, PosBadge } from "@/components/ui";
import type { StartSitScore } from "@/lib/startsit";

export type StartSitPlayer = PickablePlayer &
  StartSitScore & {
    projNext: number | null;
    seasonAvg: number | null;
    last3Avg: number | null;
    opponent: string | null;
    matchupFactor: number | null;
    softnessRank: number | null;
  };

const MAX_PLAYERS = 6;

export function StartSit({ players, initialIds }: { players: StartSitPlayer[]; initialIds: string[] }) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [ids, setIds] = useState(() => initialIds.filter((id) => byId.has(id)).slice(0, MAX_PLAYERS));
  const [slots, setSlots] = useState(1);

  useEffect(() => {
    window.history.replaceState(null, "", ids.length ? `?ids=${ids.join(",")}` : window.location.pathname);
  }, [ids]);

  const ranked = ids.map((id) => byId.get(id)!).sort((a, b) => b.score - a.score);
  const axisMax = Math.max(10, ...ranked.map((p) => Math.max(p.ceiling ?? 0, p.score))) * 1.05;
  const x = (v: number) => `${(Math.max(v, 0) / axisMax) * 100}%`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <PlayerPicker
            players={players}
            exclude={new Set(ids)}
            onPick={(p) => setIds((cur) => (cur.length >= MAX_PLAYERS ? cur : [...cur, p.id]))}
            placeholder={ids.length >= MAX_PLAYERS ? "Max 6 players" : "Add players you're deciding between"}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-2">
          Starting
          <div className="flex rounded-md border border-line p-0.5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setSlots(n)}
                className={`rounded px-2.5 py-1 ${n === slots ? "bg-surface-2 font-medium text-ink" : "hover:text-ink"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {ids.length > 0 && (
          <button onClick={() => setIds([])} className="ml-auto text-xs text-ink-2 hover:text-ink">
            Clear
          </button>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Add two or more players to compare them for this week.
        </div>
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_repeat(4,4.5rem)] gap-3 border-b border-line px-4 py-2 text-xs text-muted md:grid">
            <span>Player</span>
            <span>Score with floor–ceiling range</span>
            <span className="text-right">Proj</span>
            <span className="text-right">Last 3</span>
            <span className="text-right">Matchup</span>
            <span className="text-right">Score</span>
          </div>
          <ul>
            {ranked.map((p, i) => {
              const start = i < slots && p.status === "ok";
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_repeat(4,4.5rem)]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex w-14 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        start ? "bg-surface-2 text-good" : "text-muted"
                      }`}
                    >
                      {start ? "✓ Start" : p.status === "out" ? "✕ Out" : p.status === "bye" ? "– Bye" : "Sit"}
                    </span>
                    <PosBadge position={p.position} />
                    <span className="flex min-w-0 overflow-hidden text-sm">
                      <PlayerLink id={p.id} name={p.name} />
                    </span>
                    <span className="shrink-0 text-xs text-muted">{p.opponent ? `vs ${p.opponent}` : "no game"}</span>
                    <InjuryTag status={p.injury} />
                  </div>

                  <button
                    onClick={() => setIds((cur) => cur.filter((x) => x !== p.id))}
                    aria-label={`Remove ${p.name}`}
                    className="justify-self-end px-1 text-muted hover:text-ink md:hidden"
                  >
                    ×
                  </button>

                  {/* Range: whisker from floor to ceiling, dot at the score */}
                  <div className="relative col-span-2 h-5 md:col-span-1" aria-hidden>
                    <div className="absolute inset-x-0 top-1/2 h-px bg-grid" />
                    {p.status === "ok" && p.floor != null && p.ceiling != null && (
                      <div
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent opacity-40"
                        style={{ left: x(p.floor), width: `calc(${x(p.ceiling)} - ${x(p.floor)})` }}
                      />
                    )}
                    {p.status === "ok" && (
                      <div
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
                        style={{ left: x(p.score) }}
                      />
                    )}
                  </div>

                  <Num label="Proj" value={p.projNext} />
                  <Num label="Last 3" value={p.last3Avg} />
                  <div className="text-right text-sm">
                    <span className="mr-1 text-xs text-muted md:hidden">Matchup</span>
                    <MatchupText factor={p.matchupFactor} rank={p.softnessRank} />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular text-sm font-semibold">{p.status === "ok" ? p.score.toFixed(1) : "–"}</span>
                    <button
                      onClick={() => setIds((cur) => cur.filter((x) => x !== p.id))}
                      aria-label={`Remove ${p.name}`}
                      className="hidden px-1 text-muted hover:text-ink md:block"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Num({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="tabular text-right text-sm">
      <span className="mr-1 text-xs text-muted md:hidden">{label}</span>
      {value == null ? "–" : value.toFixed(1)}
    </div>
  );
}

function MatchupText({ factor, rank }: { factor: number | null; rank: number | null }) {
  if (factor == null) return <span className="text-muted">–</span>;
  const pctDiff = Math.round((factor - 1) * 100);
  return (
    <span title={rank ? `${rank} softest of 32` : undefined} className={`tabular ${pctDiff > 4 ? "text-good" : pctDiff < -4 ? "text-critical" : "text-ink-2"}`}>
      {pctDiff > 0 ? "+" : ""}
      {pctDiff}%
    </span>
  );
}
