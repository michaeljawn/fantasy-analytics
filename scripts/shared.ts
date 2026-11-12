// Helpers shared by the ingest and league import scripts

import { pool } from "../lib/db";

export { pool };
export { fetchJson, SLEEPER_V1, sleep, upsert } from "../lib/importer";

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Runs a script's main(), closing the pool and exiting non-zero on failure
export function run(main: () => Promise<void>) {
  main()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
