"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Remembers which manager this browser belongs to, so league pages can highlight your team
export function TeamPicker({
  teams,
  value,
}: {
  teams: { owner_id: string | null; team_name: string; display_name: string }[];
  value: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(userId: string) {
    document.cookie = userId
      ? `team=${userId}; path=/; max-age=31536000; samesite=lax`
      : "team=; path=/; max-age=0; samesite=lax";
    startTransition(() => router.refresh());
  }

  return (
    <label className={`flex items-center gap-2 text-xs text-ink-2 ${pending ? "opacity-60" : ""}`}>
      My team
      <select
        value={value ?? ""}
        onChange={(e) => select(e.target.value)}
        className="max-w-56 cursor-pointer rounded-full border border-line bg-surface-2/50 px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-accent/60 focus:border-accent focus:outline-none"
      >
        <option value="">Choose your team…</option>
        {teams
          .filter((t) => t.owner_id)
          .map((t) => (
            <option key={t.owner_id} value={t.owner_id!}>
              {t.team_name} ({t.display_name})
            </option>
          ))}
      </select>
    </label>
  );
}
