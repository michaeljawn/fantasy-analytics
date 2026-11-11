-- Fantasy Football Analytics Database (v2)
-- File: db/05_editions.sql
-- Author: Michael John
-- Description: The weekly league newspaper. Each edition is generated once by
--              scripts/generate-edition.ts and stored whole, so every leaguemate reads the
--              same paper and it never changes after publishing (regenerating needs --force).

CREATE TABLE IF NOT EXISTS league_editions(
	league_id     TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	week          INT  NOT NULL,                 -- the week whose results it covers
	writer        TEXT NOT NULL,                 -- template | claude
	content       JSONB NOT NULL,                -- facts and stories; see lib/newspaper/types.ts
	published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (league_id, week)
);
