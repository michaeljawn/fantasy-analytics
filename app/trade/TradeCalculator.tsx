"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PlayerPicker, type PickablePlayer } from "@/components/PlayerPicker";
import { InjuryTag, PlayerLink, PosBadge, SignalTag } from "@/components/ui";
import type { Signal } from "@/lib/blend";
import { PICK_ROUNDS, PICK_SLOTS } from "@/lib/picks";
import { evaluateTrade } from "@/lib/trade";

export type TradeAsset = PickablePlayer & {
  market: number | null;
  model: number | null;
  signal: Signal;
  age?: number | null;
  outlook?: number;
  posRank?: number;
};

type Side = "a" | "b";

// A team can own several of the same pick (e.g. two 2027 Mid 1sts), so picks get an instance suffix
const SEP = "~";
const baseId = (key: string) => key.split(SEP)[0];

export function TradeCalculator({
  assets,
  mode,
  teams,
  superflex,
  initialA,
  initialB,
}: {
  assets: TradeAsset[];
  mode: "redraft" | "dynasty";
  teams: number;
  superflex: boolean;
  initialA: string[];
  initialB: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const byId = useMemo(() => new Map(assets.map((p) => [p.id, p])), [assets]);
  const picks = useMemo(() => assets.filter((p) => p.kind === "pick"), [assets]);
  const [sides, setSides] = useState<Record<Side, string[]>>({
    a: initialA.filter((k) => byId.has(baseId(k))),
    b: initialB.filter((k) => byId.has(baseId(k))),
  });

  // Only players are unique; picks can be added again
  const selectedPlayers = useMemo(
    () => new Set([...sides.a, ...sides.b].filter((k) => !k.includes(SEP))),
    [sides],
  );
  const resolve = (keys: string[]) => keys.map((key) => ({ key, asset: byId.get(baseId(key))! }));
  const a = resolve(sides.a);
  const b = resolve(sides.b);
  const verdict = evaluateTrade(
    a.map((x) => x.asset.value),
    b.map((x) => x.asset.value),
  );

  // Keep the trade in the URL so it can be shared or survive a settings change
  const query = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      mode: mode === "dynasty" ? "dynasty" : undefined,
      teams: String(teams),
      sf: superflex ? "1" : undefined,
      a: sides.a.join(","),
      b: sides.b.join(","),
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "teams" && v === "12")) params.set(k, v);
    return `${pathname}?${params}`;
  };

  useEffect(() => {
    window.history.replaceState(null, "", query({}));
  }, [sides]);

  const add = (side: Side, asset: TradeAsset) =>
    setSides((s) => {
      let key = asset.id;
      if (asset.kind === "pick") {
        const used = new Set([...s.a, ...s.b]);
        let n = 1;
        while (used.has(`${asset.id}${SEP}${n}`)) n++;
        key = `${asset.id}${SEP}${n}`;
      }
      return { ...s, [side]: [...s[side], key] };
    });
  const remove = (side: Side, key: string) => setSides((s) => ({ ...s, [side]: s[side].filter((x) => x !== key) }));

  // Assets that would bring the trade closest to even if added to the short side
  const suggestions = useMemo(() => {
    if (verdict.favored == null || a.length === 0 || b.length === 0) return [];
    const short: Side = verdict.favored === "A" ? "b" : "a";
    const aValues = a.map((x) => x.asset.value);
    const bValues = b.map((x) => x.asset.value);
    return assets
      .filter((p) => !selectedPlayers.has(p.id) && p.value > 0)
      .map((p) => {
        const v = short === "a" ? evaluateTrade([...aValues, p.value], bValues) : evaluateTrade(aValues, [...bValues, p.value]);
        return { p, diff: Math.abs(v.diffPct) };
      })
      .filter((s) => s.diff < Math.abs(verdict.diffPct))
      .sort((x, y) => x.diff - y.diff)
      .slice(0, 5)
      .map((s) => ({ ...s, side: short }));
  }, [sides, assets]);

  const total = verdict.sideA + verdict.sideB;
  const count = selectedPlayers.size + [...sides.a, ...sides.b].filter((k) => k.includes(SEP)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <div className="flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="League type">
          {(["redraft", "dynasty"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={m === mode}
              onClick={() => router.push(query({ mode: m === "dynasty" ? "dynasty" : undefined }))}
              className={`rounded px-2.5 py-1 capitalize ${m === mode ? "bg-surface-2 font-medium text-ink" : "hover:text-ink"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-line p-0.5">
          {[10, 12, 14].map((t) => (
            <button
              key={t}
              onClick={() => router.push(query({ teams: String(t) }))}
              className={`rounded px-2.5 py-1 ${t === teams ? "bg-surface-2 font-medium text-ink" : "hover:text-ink"}`}
            >
              {t} teams
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={superflex} onChange={(e) => router.push(query({ sf: e.target.checked ? "1" : undefined }))} />
          Superflex
        </label>
        {count > 0 && (
          <button onClick={() => setSides({ a: [], b: [] })} className="ml-auto text-ink-2 hover:text-ink">
            Clear trade
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["a", "b"] as Side[]).map((side) => {
          const list = side === "a" ? a : b;
          const value = side === "a" ? verdict.sideA : verdict.sideB;
          return (
            <section key={side} className="rounded-lg border border-line bg-surface p-4">
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: side === "a" ? "var(--series-1)" : "var(--series-2)" }} />
                  Team {side.toUpperCase()} receives
                </h2>
                <span className="tabular text-sm text-ink-2">{value.toFixed(1)}</span>
              </header>
              <PlayerPicker
                players={assets}
                exclude={selectedPlayers}
                onPick={(p) => add(side, p)}
                placeholder={mode === "dynasty" ? "Add a player or pick" : "Add a player"}
              />
              {mode === "dynasty" && <PickAdder picks={picks} onAdd={(p) => add(side, p)} />}
              <ul className="mt-3 space-y-1">
                {list.map(({ key, asset }) => (
                  <li key={key} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-surface-2">
                    <PosBadge position={asset.position} />
                    {asset.kind === "pick" ? (
                      <>
                        <span className="font-medium">{asset.name}</span>
                        <span className="hidden text-xs text-muted sm:inline">Rookie pick</span>
                      </>
                    ) : (
                      <>
                        <PlayerLink id={asset.id} name={asset.name} />
                        <span className="hidden shrink-0 text-xs text-muted sm:inline">
                          {asset.team ?? "FA"} · {asset.position}
                          {asset.posRank}
                          {mode === "dynasty" && asset.age ? ` · ${asset.age} yo` : ` · ${asset.outlook?.toFixed(1)}/g`}
                        </span>
                        <InjuryTag status={asset.injury} />
                        <SignalTag signal={asset.signal} market={asset.market} model={asset.model} />
                      </>
                    )}
                    <span
                      className="tabular ml-auto"
                      title={[asset.market != null && `Market ${asset.market.toFixed(1)}`, asset.model != null && `Model ${asset.model.toFixed(1)}`].filter(Boolean).join(" · ") || undefined}
                    >
                      {asset.value.toFixed(1)}
                    </span>
                    <button onClick={() => remove(side, key)} aria-label={`Remove ${asset.name}`} className="px-1 text-muted hover:text-ink">
                      ×
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="py-4 text-center text-xs text-muted">Nothing added yet</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {a.length > 0 && b.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {verdict.favored == null ? "Fair trade" : `${verdict.label}: Team ${verdict.favored} wins`}
            </h2>
            <span className="tabular text-sm text-ink-2">
              {verdict.favored == null ? "Within 7%" : `by ${Math.abs(verdict.diffPct).toFixed(0)}% of package value`}
            </span>
          </div>

          <div className="mt-4 flex h-3 w-full gap-0.5" role="img" aria-label={`Team A ${verdict.sideA.toFixed(1)}, Team B ${verdict.sideB.toFixed(1)}`}>
            <div className="rounded-l-sm" style={{ width: `${(verdict.sideA / total) * 100}%`, background: "var(--series-1)" }} />
            <div className="rounded-r-sm" style={{ width: `${(verdict.sideB / total) * 100}%`, background: "var(--series-2)" }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-ink-2">
            <span className="tabular">Team A gets {verdict.sideA.toFixed(1)}</span>
            <span className="tabular">Team B gets {verdict.sideB.toFixed(1)}</span>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-ink-2">
                To even it out, Team {suggestions[0].side.toUpperCase()} could also get:
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {suggestions.map(({ p, side }) => (
                  <li key={p.id}>
                    <button
                      onClick={() => add(side, p)}
                      className="rounded-md border border-line px-2.5 py-1.5 text-xs hover:border-accent hover:text-accent"
                    >
                      + {p.name} <span className="text-muted">{p.position} · {p.value.toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PickAdder({ picks, onAdd }: { picks: TradeAsset[]; onAdd: (p: TradeAsset) => void }) {
  const years = [...new Set(picks.map((p) => p.id.split("-")[1]))];
  const [year, setYear] = useState(years[0]);
  const [round, setRound] = useState("1");
  const [slot, setSlot] = useState<string>("mid");
  const pick = picks.find((p) => p.id === `pick-${year}-${round}-${slot}`);
  const select = "rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select aria-label="Draft year" value={year} onChange={(e) => setYear(e.target.value)} className={select}>
        {years.map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>
      <select aria-label="Pick slot" value={slot} onChange={(e) => setSlot(e.target.value)} className={select}>
        {PICK_SLOTS.map((s) => (
          <option key={s} value={s.toLowerCase()}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Round" value={round} onChange={(e) => setRound(e.target.value)} className={select}>
        {Array.from({ length: PICK_ROUNDS }, (_, i) => (
          <option key={i} value={i + 1}>
            Round {i + 1}
          </option>
        ))}
      </select>
      <button
        onClick={() => pick && onAdd(pick)}
        className="rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-accent"
      >
        + Add pick{pick ? ` (${pick.value.toFixed(1)})` : ""}
      </button>
    </div>
  );
}
