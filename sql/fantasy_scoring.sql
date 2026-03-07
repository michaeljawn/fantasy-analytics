-- Fantasy Football Analytics Database
-- File: fantasy_scoring.sql
-- Author: Michael John
-- Description: Calculates fantasy points from stats and fills fantasy points table

INSERT INTO fantasy_points(player_id, week, ppr_points, standard_points)

SELECT player_id, week,

	-- PPR Scoring
	((passing_yds / 25.0) + (passing_tds * 4) + (rushing_yds / 10) + (rushing_tds * 6) + (receiving_yds / 10) + (receiving_tds * 6) + (receptions) - (interceptions * 2) - (fumbles_lost * 2)) 
	AS ppr_points,

	-- Standard Scoring
	((passing_yds / 25.0) + (passing_tds * 4) + (rushing_yds / 10.0) + (rushing_tds * 6) + (receiving_yds / 10.0) + (receiving_tds * 6) - (interceptions * 2) - (fumbles_lost * 2)) 
	AS standard_points

	FROM weekly_stats;
