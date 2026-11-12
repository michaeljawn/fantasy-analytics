"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchLeague } from "@/app/leagues/actions";

const MANAGE = "manage";

// Switches between this browser's leagues, with a shortcut to add more
export function LeagueSwitcher({
  leagues,
  value,
}: {
  leagues: { league_id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(id: string) {
    if (id === MANAGE) return router.push("/leagues");
    startTransition(async () => {
      await switchLeague(id);
      router.refresh();
    });
  }

  return (
    <label className={`flex items-center gap-2 text-xs text-ink-2 ${pending ? "opacity-60" : ""}`}>
      League
      <select
        value={value}
        onChange={(e) => select(e.target.value)}
        className="max-w-56 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        {leagues.map((l) => (
          <option key={l.league_id} value={l.league_id}>
            {l.name}
          </option>
        ))}
        <option value={MANAGE}>Add or manage leagues…</option>
      </select>
    </label>
  );
}
