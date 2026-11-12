"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addLeague, findLeagues, type AddResult, type FindResult } from "@/app/leagues/actions";
import { TeamAvatar } from "@/components/TeamAvatar";

const input = "min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted";

function Submit({ children, pending: pendingLabel }: { children: React.ReactNode; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function FormError({ result }: { result: AddResult | FindResult }) {
  return result && "error" in result ? <p className="mt-2 text-sm text-critical">{result.error}</p> : null;
}

// Look up a Sleeper username and add any of their leagues. Also picks their team in each league.
export function FindLeagues({ myLeagueIds }: { myLeagueIds: string[] }) {
  const [found, find] = useActionState(findLeagues, null);
  const [added, add] = useActionState(addLeague, null);

  return (
    <div>
      <form action={find} className="flex gap-2">
        <input name="username" placeholder="Sleeper username" autoComplete="username" required className={input} />
        <Submit pending="Searching…">Find my leagues</Submit>
      </form>
      <FormError result={found} />

      {found?.ok && (
        <div className="mt-4">
          <p className="text-xs text-muted">
            {found.leagues.length === 0
              ? `${found.username} isn't in any leagues this season.`
              : `${found.username}'s leagues this season`}
          </p>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {found.leagues.map((l) => (
              <li key={l.league_id} className="flex items-center gap-3 p-3">
                <TeamAvatar url={l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null} name={l.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted">
                    {l.season} · {l.total_rosters} teams
                  </p>
                </div>
                {myLeagueIds.includes(l.league_id) ? (
                  <span className="text-xs text-muted">Added</span>
                ) : (
                  <form action={add}>
                    <input type="hidden" name="leagueId" value={l.league_id} />
                    <input type="hidden" name="userId" value={found.userId} />
                    <Submit pending="Importing…">Add</Submit>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <FormError result={added} />
        </div>
      )}
    </div>
  );
}

export function AddById() {
  const [result, add] = useActionState(addLeague, null);
  return (
    <div>
      <form action={add} className="flex gap-2">
        <input name="leagueId" placeholder="League ID" inputMode="numeric" required className={input} />
        <Submit pending="Importing…">Add league</Submit>
      </form>
      <FormError result={result} />
    </div>
  );
}
