export function SetupNotice({ error }: { error?: string | null }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6">
      <h1 className="text-base font-semibold">No data yet</h1>
      <p className="mt-2 text-sm text-ink-2">Start the database and load stats from Sleeper:</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">
        {`npm run db:up\nnpm run ingest:all   # 2023–2026, takes a few minutes`}
      </pre>
      {error && <p className="mt-3 text-xs break-words text-muted">Details: {error}</p>}
    </div>
  );
}
