-- Fantasy Football Analytics Database
-- File: schema.sql
-- Author: Michael John
-- Description: Creates database tables, constraints, and indexes

-- Player Table
CREATE TABLE players(
	player_id SERIAL PRIMARY KEY,
	first_name VARCHAR(50) NOT NULL,
	last_name VARCHAR(50) NOT NULL,
	position VARCHAR(5) NOT NULL,
	team VARCHAR(5) NOT NULL
);

-- Weekly Stats Table
CREATE TABLE weekly_stats(
	stat_id SERIAL PRIMARY KEY,
	player_id INT NOT NULL,
	week INT NOT NULL,

	passing_yds INT DEFAULT 0,
	passing_tds INT DEFAULT 0,
	interceptions INT DEFAULT 0,

	rushing_yds INT DEFAULT 0,
	rushing_tds INT DEFAULT 0,

	receptions INT DEFAULT 0,
	receiving_yds INT DEFAULT 0,
	receiving_tds INT DEFAULT 0,

	fumbles_lost INT DEFAULT 0,

	FOREIGN KEY (player_id) REFERENCES players(player_id)
);

-- Fantasy Points Table
CREATE TABLE fantasy_points(
	fantasy_id SERIAL PRIMARY KEY,
	player_id INT NOT NULL,
	week INT NOT NULL,

	ppr_points NUMERIC(6,2),
	standard_points NUMERIC(6,2),

	FOREIGN KEY (player_id) REFERENCES players(player_id)
);

-- Constraints
ALTER TABLE weekly_stats
	ADD CONSTRAINT unique_player_week
		UNIQUE (player_id, week);

ALTER TABLE fantasy_points
	ADD CONSTRAINT unique_player_week_fantasy
		UNIQUE (player_id, week);

-- Indexes
CREATE INDEX idx_player_id ON weekly_stats(player_id);
CREATE INDEX idx_player_week ON weekly_stats(player_id, week);
