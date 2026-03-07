-- Fantasy Football Analytics Database
-- File: fantasy_analytics_queries.sql
-- Author: Michael John
-- Description: Analytical queries for the fantasy database

-- Weekly Fantasy Rankings
SELECT p.first_name, p.last_name, p.position, f.week, f.ppr_points,
	
	RANK() OVER(
		PARTITION BY f.week
		ORDER BY f.ppr_points DESC
	) AS weekly_rank

	FROM fantasy_points f
	JOIN players p ON p.player_id = f.player_id

	ORDER BY f.week, weekly_rank;

-- Average Fantasy Points per Player
SELECT p.first_name, p.last_name, p.position, ROUND(AVG(f.ppr_points),2) AS avg_ppr_points

	FROM fantasy_points f
	JOIN players p ON p.player_id = f.player_id

	GROUP BY p.player_id
	ORDER BY avg_ppr_points DESC;

-- Most Consistent Players
SELECT p.first_name, p.last_name, p.position, ROUND(AVG(f.ppr_points),2) AS avg_points, ROUND(STDDEV(f.ppr_points),2) AS consistency_score

	FROM fantasy_points f
	JOIN players p ON p.player_id = f.player_id

	GROUP BY p.player_id
	ORDER BY consistency_score ASC;

-- Best Week Performances
SELECT p.first_name, p.last_name, p.position, f.week, f.ppr_points

	FROM fantasy_points f
	JOIN players p ON p.player_id = f.player_id

	ORDER BY f.ppr_points DESC
	LIMIT 10;

-- Positional Leaderboard
SELECT p.position, p.first_name, p.last_name, ROUND(AVG(f.ppr_points),2) AS avg_points

	FROM fantasy_points f
	JOIN players p ON p.player_id = f.player_id

	GROUP BY p.player_id
	ORDER BY position, avg_points DESC;