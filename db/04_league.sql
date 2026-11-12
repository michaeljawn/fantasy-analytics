-- Fantasy Football Analytics Database (v2)
-- File: db/04_league.sql
-- Author: Michael John
-- Description: A Sleeper league, imported by scripts/import-league.ts. Sleeper gives each season
--              of a league its own league_id, linked through previous_league_id, so every table
--              is keyed by league_id. Player IDs are Sleeper's, but there is no foreign key to
--              players: rosters can hold positions the stats tables don't track.

CREATE TABLE IF NOT EXISTS leagues(
	league_id          TEXT PRIMARY KEY,
	season             INT  NOT NULL,
	name               TEXT NOT NULL,
	avatar             TEXT,
	status             TEXT NOT NULL,              -- pre_draft | drafting | in_season | complete
	previous_league_id TEXT,
	total_rosters      INT  NOT NULL,
	roster_positions   TEXT[] NOT NULL,            -- starting slots then BN, e.g. {QB,RB,RB,...,SUPER_FLEX,BN}
	scoring_settings   JSONB NOT NULL,             -- Sleeper's scoring rules, e.g. {"rec": 1, "pass_td": 6}
	settings           JSONB NOT NULL,             -- type (2 = dynasty), playoff_week_start, last_scored_leg, ...
	created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),  -- first import; the oldest is the site's default league
	updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the table first shipped
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS league_users(
	league_id     TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	user_id       TEXT NOT NULL,
	display_name  TEXT NOT NULL,
	team_name     TEXT,                            -- NULL = Sleeper shows "Team <display_name>"
	avatar_url    TEXT,
	is_owner      BOOLEAN NOT NULL DEFAULT FALSE,  -- league commissioner
	PRIMARY KEY (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS league_rosters(
	league_id          TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	roster_id          INT  NOT NULL,              -- stable across seasons of the same league
	owner_id           TEXT,                       -- user_id; NULL = orphaned team
	co_owner_ids       TEXT[] NOT NULL DEFAULT '{}',
	wins               INT  NOT NULL DEFAULT 0,
	losses             INT  NOT NULL DEFAULT 0,
	ties               INT  NOT NULL DEFAULT 0,
	points_for         NUMERIC(8,2) NOT NULL DEFAULT 0,
	points_against     NUMERIC(8,2) NOT NULL DEFAULT 0,
	max_points_for     NUMERIC(8,2),               -- best possible lineup every week
	waiver_budget_used INT  NOT NULL DEFAULT 0,
	record             TEXT,                       -- e.g. WWLWL, oldest first
	PRIMARY KEY (league_id, roster_id)
);

CREATE TABLE IF NOT EXISTS league_roster_players(
	league_id   TEXT NOT NULL,
	roster_id   INT  NOT NULL,
	player_id   TEXT NOT NULL,
	slot        TEXT NOT NULL,                     -- starter | bench | reserve (IR) | taxi
	slot_index  INT,                               -- position in roster_positions for starters
	PRIMARY KEY (league_id, roster_id, player_id),
	FOREIGN KEY (league_id, roster_id) REFERENCES league_rosters(league_id, roster_id) ON DELETE CASCADE
);

-- One row per team per week. Teams sharing a matchup_id play each other.
CREATE TABLE IF NOT EXISTS league_matchups(
	league_id       TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	week            INT  NOT NULL,
	roster_id       INT  NOT NULL,
	matchup_id      INT,                           -- NULL = no regular-season game (bye or playoffs)
	points          NUMERIC(7,2) NOT NULL DEFAULT 0,
	starters        TEXT[] NOT NULL DEFAULT '{}',  -- in roster_positions order; '0' = empty slot
	starters_points NUMERIC(6,2)[] NOT NULL DEFAULT '{}',
	players_points  JSONB NOT NULL DEFAULT '{}',   -- every rostered player's points, {player_id: points}
	PRIMARY KEY (league_id, week, roster_id)
);

CREATE TABLE IF NOT EXISTS league_transactions(
	transaction_id  TEXT PRIMARY KEY,
	league_id       TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	week            INT  NOT NULL,
	type            TEXT NOT NULL,                 -- trade | waiver | free_agent | commissioner
	status          TEXT NOT NULL,                 -- complete | failed
	created_at      TIMESTAMPTZ NOT NULL,
	roster_ids      INT[] NOT NULL DEFAULT '{}',
	adds            JSONB NOT NULL DEFAULT '{}',   -- {player_id: roster_id that received him}
	drops           JSONB NOT NULL DEFAULT '{}',   -- {player_id: roster_id that gave him up}
	draft_picks     JSONB NOT NULL DEFAULT '[]',   -- picks that changed hands in a trade
	waiver_budget   JSONB NOT NULL DEFAULT '[]',   -- FAAB that changed hands in a trade
	waiver_bid      INT
);

CREATE INDEX IF NOT EXISTS idx_league_transactions_week ON league_transactions(league_id, week);

-- Current owner of every traded future pick. Untraded picks belong to their original roster.
CREATE TABLE IF NOT EXISTS league_traded_picks(
	league_id         TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
	season            INT  NOT NULL,
	round             INT  NOT NULL,
	roster_id         INT  NOT NULL,               -- original owner
	owner_id          INT  NOT NULL,               -- current owner (roster_id)
	previous_owner_id INT,
	PRIMARY KEY (league_id, season, round, roster_id)
);
