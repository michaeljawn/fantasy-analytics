"use client";

import { useMemo, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";

export type PickablePlayer = {
  kind?: "player" | "pick";
  id: string;
  name: string;
  position: string;
  team: string | null;
  injury: string | null;
  value: number;
};

export function PlayerPicker<T extends PickablePlayer>({
  players,
  exclude,
  onPick,
  placeholder = "Add a player",
}: {
  players: T[];
  exclude: Set<string>;
  onPick: (p: T) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return players.filter((p) => !exclude.has(p.id) && p.name.toLowerCase().includes(term)).slice(0, 8);
  }, [q, players, exclude]);

  function pick(p: T) {
    onPick(p);
    setQ("");
    setActive(0);
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, matches.length - 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && matches[active]) pick(matches[active]);
        }}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {p.kind === "pick" ? (
                    <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-2">
                      PK
                    </span>
                  ) : (
                    <PlayerAvatar id={p.id} name={p.name} />
                  )}
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">{p.kind === "pick" ? "Rookie pick" : `${p.position} · ${p.team ?? "FA"}`}</span>
                </span>
                <span className="tabular text-xs text-ink-2">{p.value.toFixed(1)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
