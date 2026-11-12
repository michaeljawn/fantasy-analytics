// Helpers for writing Sleeper data into Postgres, shared by the CLI scripts and the site

import { pool } from "./db";

export const SLEEPER_V1 = "https://api.sleeper.app/v1";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "TheFrontOffice/2.0" }, cache: "no-store" });
      if (res.status === 429) throw new Error("rate limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url}: ${(err as Error).message}`);
      await sleep(1500 * attempt);
    }
  }
}

export async function upsert(
  table: string,
  columns: string[],
  key: string[],
  rows: unknown[][],
  opts: { doNothing?: boolean } = {},
) {
  const updates = columns.filter((c) => !key.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  const conflict =
    opts.doNothing || updates.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${updates.join(", ")}${table === "players" || table === "leagues" ? ", updated_at = now()" : ""}`;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}
       ON CONFLICT (${key.join(", ")}) ${conflict}`,
      params,
    );
  }
}
