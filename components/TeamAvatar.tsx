"use client";

import Image from "next/image";
import { useState } from "react";

// League manager avatar, falling back to the team's initials
export function TeamAvatar({ url, name, size = 24 }: { url: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-ink-2"
      style={{ width: size, height: size, fontSize: Math.max(size * 0.36, 9) }}
      aria-hidden
    >
      {url && !failed ? (
        <Image
          src={url}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-semibold">{initials || "?"}</span>
      )}
    </span>
  );
}
