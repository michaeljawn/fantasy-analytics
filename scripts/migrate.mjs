// Applies every db/*.sql file in order to the running database container.
// Each file is idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT), so this is safe to re-run.
// Usage: npm run db:migrate
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const files = readdirSync("db").filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  execFileSync("docker", ["exec", "-i", "-e", "PGOPTIONS=-c client_min_messages=warning", "fantasy-db", "psql", "-U", "fantasy", "-d", "fantasy", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: readFileSync(`db/${file}`),
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(`✓ ${file}`);
}
