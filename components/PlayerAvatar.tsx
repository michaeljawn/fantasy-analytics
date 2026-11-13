"use client";

import Image from "next/image";
import { useState } from "react";
import { teamGradient } from "@/lib/nfl-colors";

// Team defenses use the team code as their player ID (e.g. "KC")
const isTeamDefense = (id: string) => /^[A-Z]{2,3}$/.test(id);

// Sleeper headshot (or team logo for a defense) over the team's colors, falling back to initials.
// Headshots are transparent, so the team gradient shows behind the player.
export function PlayerAvatar({
  id,
  name,
  team,
  size = 24,
  background = "bg-surface-2 text-ink-2",
}: {
  id: string;
  name: string;
  team?: string | null;
  size?: number;
  background?: string;
}) {
  const [failed, setFailed] = useState(false);
  const gradient = teamGradient(isTeamDefense(id) ? null : team);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${gradient ? "text-white" : background}`}
      style={{ width: size, height: size, fontSize: Math.max(size * 0.36, 9), background: gradient }}
      aria-hidden
    >
      {failed ? (
        <span className="font-semibold">{initials}</span>
      ) : (
        <Image
          src={
            isTeamDefense(id)
              ? `https://sleepercdn.com/images/team_logos/nfl/${id.toLowerCase()}.png`
              : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`
          }
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          className={isTeamDefense(id) ? "h-full w-full object-contain p-[12%]" : "h-full w-full object-cover object-top"}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
