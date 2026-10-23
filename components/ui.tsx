import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function PosBadge({ position }: { position: string }) {
  return (
    <span className="inline-block w-7 rounded bg-surface-2 py-0.5 text-center text-[10px] font-semibold text-ink-2">
      {position}
    </span>
  );
}

const INJURY_STYLE: Record<string, { label: string; color: string }> = {
  Questionable: { label: "Q", color: "var(--warning)" },
  Doubtful: { label: "D", color: "var(--serious)" },
  Out: { label: "O", color: "var(--critical)" },
  IR: { label: "IR", color: "var(--critical)" },
  PUP: { label: "PUP", color: "var(--critical)" },
  Sus: { label: "SUS", color: "var(--critical)" },
};

export function InjuryTag({ status }: { status: string | null }) {
  if (!status) return null;
  const s = INJURY_STYLE[status] ?? { label: status, color: "var(--muted)" };
  return (
    <span title={status} className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-2">
      <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function PlayerLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/players/${id}`} className="group inline-flex min-w-0 items-center gap-2 font-medium">
      <PlayerAvatar id={id} name={name} />
      <span className="truncate group-hover:text-accent group-hover:underline">{name}</span>
    </Link>
  );
}

export function Delta({ value, digits = 1, suffix = "" }: { value: number | null; digits?: number; suffix?: string }) {
  if (value == null) return <span className="text-muted">–</span>;
  const up = value > 0;
  return (
    <span className={`tabular ${up ? "text-good" : value < 0 ? "text-critical" : "text-ink-2"}`}>
      {up ? "▲" : value < 0 ? "▼" : ""} {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function fmt(n: number | null | undefined, digits = 1) {
  return n == null ? "–" : n.toFixed(digits);
}

export function pct(n: number | null | undefined) {
  return n == null ? "–" : `${Math.round(n * 100)}%`;
}

export function Segmented({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="flex flex-wrap rounded-md border border-line p-0.5 text-xs">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          className={`rounded px-2.5 py-1 ${i.active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

// Market vs. model disagreement. Always icon + label, never color alone.
export function SignalTag({
  signal,
  market,
  model,
}: {
  signal: "buy" | "sell" | null | undefined;
  market?: number | null;
  model?: number | null;
}) {
  if (!signal) return null;
  const buy = signal === "buy";
  const detail =
    market != null && model != null
      ? `Market ${market.toFixed(1)} vs model ${model.toFixed(1)}: ${
          buy ? "production supports more than the market pays" : "the market pays more than production supports"
        }`
      : undefined;
  return (
    <span
      title={detail}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ color: buy ? "var(--good)" : "var(--serious)" }}
    >
      <span aria-hidden>{buy ? "↗" : "↘"}</span>
      {buy ? "Buy low" : "Sell high"}
    </span>
  );
}
