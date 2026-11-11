-- Fantasy Football Analytics Database (v2)
-- File: db/03_history_backfill.sql
-- Description: Brings databases created before the 2014+ backfill up to the current schema.
--              Safe to re-run. Fresh databases already match via 01_schema.sql.

-- Player birth dates, for age in any season (aging curves)
ALTER TABLE players ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Snap counts only exist from 2020; NULL means "not recorded" rather than zero snaps
ALTER TABLE weekly_stats ALTER COLUMN off_snaps DROP NOT NULL;
ALTER TABLE weekly_stats ALTER COLUMN off_snaps DROP DEFAULT;
ALTER TABLE weekly_stats ALTER COLUMN team_off_snaps DROP NOT NULL;
ALTER TABLE weekly_stats ALTER COLUMN team_off_snaps DROP DEFAULT;
