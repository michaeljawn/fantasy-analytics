-- Fantasy Football Analytics Database
-- File: seed_data.sql
-- Author: Michael John
-- Description: Inserts data into the database

-- Reset Tables for Clean Seed
TRUNCATE TABLE fantasy_points, weekly_stats, players RESTART IDENTITY CASCADE;

-- Insert Players
INSERT INTO players
(first_name, last_name, position, team)
	VALUES
	('Jalen', 'Hurts', 'QB', 'PHI'),
	('Josh', 'Allen', 'QB', 'BUF'),
	('Bijan', 'Robinson', 'RB', 'ATL'),
	('Saquon', 'Barkley', 'RB', 'PHI'),
	('Justin', 'Jefferson', 'WR', 'MIN'),
	('Jaxon', 'Smith-Njigba', 'WR', 'SEA');

-- Week 1 Stats
INSERT INTO weekly_stats
(player_id, week, passing_yds, passing_tds, interceptions, rushing_yds, rushing_tds, receptions, receiving_yds, receiving_tds, fumbles_lost)
	VALUES
	(1,1,275,2,1,35,1,0,0,0,0),
	(2,1,240,2,0,50,1,0,0,0,0),
	(3,1,0,0,0,90,1,6,55,0,0),
	(4,1,0,0,0,75,0,4,25,0,0),
	(5,1,0,0,0,0,0,8,120,1,0),
	(6,1,0,0,0,0,0,7,95,1,0);

-- Week 2 Stats
INSERT INTO weekly_stats
(player_id, week, passing_yds, passing_tds, interceptions, rushing_yds, rushing_tds, receptions, receiving_yds, receiving_tds, fumbles_lost)
	VALUES
	(1,2,310,3,0,20,0,0,0,0,0),
	(2,2,260,1,1,40,1,0,0,0,0),
	(3,2,0,0,0,105,1,5,40,1,0),
	(4,2,0,0,0,65,1,3,20,0,0),
	(5,2,0,0,0,0,0,10,140,1,0),
	(6,2,0,0,0,0,0,6,88,0,0);

-- Week 3 Stats
INSERT INTO weekly_stats
(player_id, week, passing_yds, passing_tds, interceptions, rushing_yds, rushing_tds, receptions, receiving_yds, receiving_tds, fumbles_lost)
	VALUES
	(1,3,295,2,1,45,1,0,0,0,0),
	(2,3,220,1,1,55,1,0,0,0,0),
	(3,3,0,0,0,80,0,7,60,0,0),
	(4,3,0,0,0,95,1,2,15,0,0),
	(5,3,0,0,0,0,0,6,110,1,0),
	(6,3,0,0,0,0,0,9,130,1,0);

-- Week 4 Stats
INSERT INTO weekly_stats
(player_id, week, passing_yds, passing_tds, interceptions, rushing_yds, rushing_tds, receptions, receiving_yds, receiving_tds, fumbles_lost)
	VALUES
	(1,4,340,4,0,30,0,0,0,0,0),
	(2,4,280,2,0,65,1,0,0,0,0),
	(3,4,0,0,0,115,2,4,30,0,0),
	(4,4,0,0,0,70,0,5,45,1,0),
	(5,4,0,0,0,0,0,11,150,2,0),
	(6,4,0,0,0,0,0,8,120,1,0);