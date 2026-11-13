"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import type { PlayerLookup } from "@/lib/queries";

export function PlayerSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerLookup[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        setResults(await res.json());
        setActive(0);
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(p: PlayerLookup) {
    setOpen(false);
    setQ("");
    router.push(`/players/${p.player_id}`);
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:flex-none">
      <input
        type="search"
        value={q}
        placeholder="Search players"
        aria-label="Search players"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && results[active]) go(results[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-full border border-line bg-surface-2/50 px-3.5 py-1.5 text-sm outline-none transition-[width,border-color,background-color] placeholder:text-muted focus:border-accent focus:bg-surface sm:w-40 sm:focus:w-56"
      />
      {open && results.length > 0 && (
        <ul className="pop-in absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl">
          {results.map((p, i) => (
            <li key={p.player_id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar id={p.player_id} name={p.name} team={p.team} />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-xs text-muted">
                  {p.position} · {p.team ?? "FA"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
