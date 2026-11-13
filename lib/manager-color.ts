// A signature color for each league manager, stable across pages and leagues.
// Picked from a fixed palette by hashing an ID, so it needs no storage.
const PALETTE = [
  "#ff5a5f", // red
  "#ff8a3d", // orange
  "#ffc53d", // gold
  "#c6f432", // volt
  "#2ee59d", // mint
  "#2dd4bf", // teal
  "#38bdf8", // sky
  "#4c7dff", // blue
  "#8b5cf6", // violet
  "#d946ef", // magenta
  "#f472b6", // pink
  "#a3a3a3", // silver
];

export function managerColor(key: string | number | null | undefined) {
  const s = String(key ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
