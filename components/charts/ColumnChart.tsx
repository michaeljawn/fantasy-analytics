"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type Column = {
  key: string;
  label: string; // x-axis tick
  value: number;
  projected?: boolean;
  tooltip: { title: string; lines: string[] };
};

const HEIGHT = 220;
const PAD = { top: 16, right: 8, bottom: 28, left: 32 };
const MAX_BAR = 24;

// Rounded data-end, square at the baseline
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v: number) {
  const step = v > 40 ? 10 : 5;
  return Math.max(step, Math.ceil(v / step) * step);
}

export function ColumnChart({
  data,
  reference,
  ariaLabel,
}: {
  data: Column[];
  reference?: { value: number; label: string };
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...data.map((d) => d.value), reference?.value ?? 0, 1));
  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(MAX_BAR, Math.max(band - 2, 2));
  const y = (v: number) => PAD.top + innerH - (Math.max(v, 0) / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = band < 22 ? Math.ceil(22 / band) : 1;
  const hovered = hover != null ? data[hover] : null;

  return (
    <div ref={wrap} className="relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-muted text-[10px]">
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = Math.max(PAD.top + innerH - y(d.value), d.value > 0 ? 2 : 0);
          return (
            <g key={d.key}>
              <path
                d={barPath(cx - barW / 2, PAD.top + innerH - h, barW, h)}
                fill={d.projected ? "var(--series-1-proj)" : "var(--series-1)"}
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
              {i % labelEvery === 0 && (
                <text x={cx} y={HEIGHT - 10} textAnchor="middle" className="fill-muted text-[10px]">
                  {d.label}
                </text>
              )}
              {/* Hit target: the full column band, not just the bar */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}

        {reference && (
          <g pointerEvents="none">
            <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--ink-2)" strokeWidth={1} opacity={0.6} />
            <text x={width - PAD.right} y={y(reference.value) - 4} textAnchor="end" className="fill-ink-2 text-[10px]">
              {reference.label}
            </text>
          </g>
        )}
      </svg>

      {hovered && hover != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(PAD.left + band * hover + band / 2 - 72, 0), width - 150),
            top: Math.max(y(hovered.value) - 70, 0),
          }}
        >
          <div className="font-semibold text-ink">{hovered.tooltip.title}</div>
          {hovered.tooltip.lines.map((l) => (
            <div key={l} className="tabular text-ink-2">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
