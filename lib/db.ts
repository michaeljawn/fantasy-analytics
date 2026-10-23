import { Pool, types } from "pg";

// Return NUMERIC and BIGINT (COUNT) columns as JS numbers instead of strings
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://fantasy:fantasy@localhost:5433/fantasy",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPool.pgPool = pool;

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}
