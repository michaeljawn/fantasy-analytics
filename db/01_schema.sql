-- Fantasy Football Analytics Database (v2)
-- File: db/01_schema.sql
-- Author: Michael John
-- Description: Multi-season schema keyed on Sleeper player IDs. Fantasy points are
--              derived from raw stats through the scoring_formats table, so Std / Half /
--              PPR (or any custom format) come from one source of truth.

-- Players (Sleeper registry)
CREATE TABLE IF NOT EXISTS players(
	player_id      TEXT PRIMARY KEY,           -- Sleeper player_id
	first_name     VARCHAR(50) NOT NULL,
	last_name      VARCHAR(50) NOT NULL,
	position       VARCHAR(5)  NOT NULL,
	team           VARCHAR(5),                 -- current team (NULL = free agent)
	age            INT,
	years_exp      INT,
	injury_status  VARCHAR(20),
	active         BOOLEAN NOT NULL DEFAULT TRUE,
	updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weekly game stats (only weeks a player actually played)
CREATE TABLE IF NOT EXISTS weekly_stats(
	player_id      TEXT NOT NULL REFERENCES players(player_id),
	season         INT  NOT NULL,
	week           INT  NOT NULL,
	team           VARCHAR(5),                 -- team at the time of the game
	opponent       VARCHAR(5),
	game_date      DATE,

	pass_att       INT NOT NULL DEFAULT 0,
	pass_cmp       INT NOT NULL DEFAULT 0,
	passing_yds    INT NOT NULL DEFAULT 0,
	passing_tds    INT NOT NULL DEFAULT 0,
	interceptions  INT NOT NULL DEFAULT 0,

	rush_att       INT NOT NULL DEFAULT 0,
	rushing_yds    INT NOT NULL DEFAULT 0,
	rushing_tds    INT NOT NULL DEFAULT 0,

	targets        INT NOT NULL DEFAULT 0,
	receptions     INT NOT NULL DEFAULT 0,
	receiving_yds  INT NOT NULL DEFAULT 0,
	receiving_tds  INT NOT NULL DEFAULT 0,

	two_pt         INT NOT NULL DEFAULT 0,
	fumbles_lost   INT NOT NULL DEFAULT 0,

	off_snaps      INT NOT NULL DEFAULT 0,
	team_off_snaps INT NOT NULL DEFAULT 0,

	PRIMARY KEY (player_id, season, week)
);

CREATE INDEX IF NOT EXISTS idx_weekly_stats_season_week ON weekly_stats(season, week);
CREATE INDEX IF NOT EXISTS idx_weekly_stats_opponent ON weekly_stats(season, opponent);

-- Weekly projections (Sleeper)
CREATE TABLE IF NOT EXISTS projections(
	player_id      TEXT NOT NULL REFERENCES players(player_id),
	season         INT  NOT NULL,
	week           INT  NOT NULL,
	team           VARCHAR(5),
	opponent       VARCHAR(5),
	game_date      DATE,
	pts_std        NUMERIC(6,2),
	pts_half       NUMERIC(6,2),
	pts_ppr        NUMERIC(6,2),
	PRIMARY KEY (player_id, season, week)
);

-- Scoring formats: one row per format, one column per scoring rule
CREATE TABLE IF NOT EXISTS scoring_formats(
	format         VARCHAR(10) PRIMARY KEY,
	label          VARCHAR(30) NOT NULL,
	pass_yd        NUMERIC(5,3) NOT NULL,
	pass_td        NUMERIC(5,2) NOT NULL,
	pass_int       NUMERIC(5,2) NOT NULL,
	rush_yd        NUMERIC(5,3) NOT NULL,
	rush_td        NUMERIC(5,2) NOT NULL,
	rec            NUMERIC(5,2) NOT NULL,
	rec_yd         NUMERIC(5,3) NOT NULL,
	rec_td         NUMERIC(5,2) NOT NULL,
	two_pt         NUMERIC(5,2) NOT NULL,
	fum_lost       NUMERIC(5,2) NOT NULL
);

INSERT INTO scoring_formats VALUES
	('std',  'Standard', 0.04, 4, -2, 0.1, 6, 0.0, 0.1, 6, 2, -2),
	('half', 'Half PPR', 0.04, 4, -2, 0.1, 6, 0.5, 0.1, 6, 2, -2),
	('ppr',  'PPR',      0.04, 4, -2, 0.1, 6, 1.0, 0.1, 6, 2, -2)
ON CONFLICT (format) DO NOTHING;

-- Ingestion bookkeeping
CREATE TABLE IF NOT EXISTS ingest_log(
	season         INT NOT NULL,
	week           INT NOT NULL,
	kind           VARCHAR(10) NOT NULL,       -- 'stats' | 'proj'
	rows_loaded    INT NOT NULL,
	loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (season, week, kind)
);
