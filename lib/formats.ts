// Client-safe format/position constants

export const FORMATS = [
  { id: "ppr", label: "PPR" },
  { id: "half", label: "Half" },
  { id: "std", label: "Std" },
] as const;

export type Format = (typeof FORMATS)[number]["id"];

export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type Position = (typeof POSITIONS)[number];

export function projectionColumn(format: Format) {
  return format === "ppr" ? "pts_ppr" : format === "half" ? "pts_half" : "pts_std";
}
