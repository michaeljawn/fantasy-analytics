# Projection snapshots

Sleeper weekly projections captured **before kickoff** by the `Projection snapshots` workflow on `main`
(`.github/workflows/projection-snapshots.yml`). Sleeper's historical projections are edited after games,
so these snapshots are the leak-free source for model training. See issue #20.

Layout: `<season>/week-<WW>/<captured_at>.json.gz`, gzipped JSON:

```json
{ "captured_at": "...", "season": 2026, "week": 10, "content_hash": "...",
  "rows": [{ "player_id": "...", "team": "...", "opponent": "...", "date": "YYYY-MM-DD",
             "game_id": "...", "last_modified": 0, "stats": { "pts_ppr": 0, "rec_tgt": 0, "...": 0 } }] }
```

A new file is written only when a week's projections change. For training, use the latest snapshot
captured before each game's kickoff.
