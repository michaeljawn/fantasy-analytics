"use client";

import Image from "next/image";
import { useState } from "react";

// Sleeper headshot, falling back to initials when a player has no photo
export function PlayerAvatar({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-ink-2"
      style={{ width: size, height: size, fontSize: Math.max(size * 0.36, 9) }}
      aria-hidden
    >
      {failed ? (
        <span className="font-semibold">{initials}</span>
      ) : (
        <Image
          src={`https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          className="h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
