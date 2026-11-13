"use client";

import Image from "next/image";
import { useState } from "react";
import { managerColor } from "@/lib/manager-color";

// League manager avatar, falling back to the team's initials on the manager's signature color
export function TeamAvatar({ url, name, size = 24, colorKey }: { url: string | null; name: string; size?: number; colorKey?: string | null }) {
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
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md text-[#0a0f1a]"
      style={{ width: size, height: size, fontSize: Math.max(size * 0.36, 9), background: managerColor(colorKey ?? name) }}
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
