"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FORMATS, type Format } from "@/lib/formats";

export function FormatToggle({ value }: { value: Format }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(format: Format) {
    document.cookie = `format=${format}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label="Scoring format"
      className={`flex rounded-md border border-line p-0.5 text-xs ${pending ? "opacity-60" : ""}`}
    >
      {FORMATS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={value === f.id}
          onClick={() => select(f.id)}
          className={`rounded px-2 py-1 ${value === f.id ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
