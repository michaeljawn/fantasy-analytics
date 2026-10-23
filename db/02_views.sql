-- Fantasy Football Analytics Database (v2)
-- File: db/02_views.sql
-- Author: Michael John
-- Description: Analytics layer. The dashboard reads from these views.

-- Fantasy points per player-week for every scoring format
CREATE OR REPLACE VIEW v_fantasy_points AS
SELECT w.player_id, w.season, w.week, f.format, p.position, w.team, w.opponent,

	ROUND(
		  w.passing_yds   * f.pass_yd
		+ w.passing_tds   * f.pass_td
		+ w.interceptions * f.pass_int
		+ w.rushing_yds   * f.rush_yd
		+ w.rushing_tds   * f.rush_td
		+ w.receptions    * f.rec
		+ w.receiving_yds * f.rec_yd
		+ w.receiving_tds * f.rec_td
		+ w.two_pt        * f.two_pt
		+ w.fumbles_lost  * f.fum_lost
	, 2) AS points,

	w.targets, w.rush_att, w.off_snaps,
	CASE WHEN w.team_off_snaps > 0
		THEN ROUND(w.off_snaps::NUMERIC / w.team_off_snaps, 3) END AS snap_share

	FROM weekly_stats w
	JOIN players p ON p.player_id = w.player_id
	CROSS JOIN scoring_formats f;

-- Weekly positional rank (QB1, RB12, ...)
CREATE OR REPLACE VIEW v_weekly_ranks AS
SELECT fp.*,

	RANK() OVER(
		PARTITION BY fp.season, fp.week, fp.format, fp.position
		ORDER BY fp.points DESC
	) AS pos_rank

	FROM v_fantasy_points fp;

-- Season summary per player: volume, consistency, recent form, boom/bust
CREATE OR REPLACE VIEW v_season_summary AS
WITH ranked AS (
	SELECT wr.*,
		ROW_NUMBER() OVER(
			PARTITION BY wr.player_id, wr.season, wr.format
			ORDER BY wr.week DESC
		) AS recency
		FROM v_weekly_ranks wr
)
SELECT r.player_id, r.season, r.format, r.position,
	COUNT(*)                                               AS games,
	ROUND(SUM(r.points), 2)                                AS total_points,
	ROUND(AVG(r.points), 2)                                AS avg_points,
	ROUND(COALESCE(STDDEV_SAMP(r.points), 0), 2)           AS stddev_points,
	ROUND(PERCENTILE_CONT(0.2) WITHIN GROUP (ORDER BY r.points)::NUMERIC, 2) AS floor_points,
	ROUND(PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY r.points)::NUMERIC, 2) AS ceiling_points,
	MAX(r.points)                                          AS best_week,
	ROUND(AVG(r.points) FILTER (WHERE r.recency <= 3), 2)  AS last3_avg,
	ROUND(AVG(r.snap_share) FILTER (WHERE r.recency <= 3), 3) AS last3_snap_share,
	ROUND(AVG(r.snap_share), 3)                            AS avg_snap_share,
	ROUND(AVG(r.targets), 1)                               AS avg_targets,
	ROUND(AVG(r.rush_att), 1)                              AS avg_rush_att,

	-- Boom = top-12 weekly finish (top-24 for RB/WR); bust = outside top-24 (top-36 for RB/WR)
	ROUND(AVG(CASE WHEN r.pos_rank <= CASE WHEN r.position IN ('RB','WR') THEN 24 ELSE 12 END
		THEN 1 ELSE 0 END), 3)                             AS boom_rate,
	ROUND(AVG(CASE WHEN r.pos_rank >  CASE WHEN r.position IN ('RB','WR') THEN 36 ELSE 24 END
		THEN 1 ELSE 0 END), 3)                             AS bust_rate,
	MAX(r.week)                                            AS last_week

	FROM ranked r
	GROUP BY r.player_id, r.season, r.format, r.position;

-- Fantasy points allowed by each defense to each position, vs league average
CREATE OR REPLACE VIEW v_points_allowed AS
WITH per_game AS (
	SELECT season, format, opponent AS defense, position, week,
		SUM(points) AS points
		FROM v_fantasy_points
		WHERE opponent IS NOT NULL
		GROUP BY season, format, opponent, position, week
),
by_defense AS (
	SELECT season, format, defense, position,
		COUNT(*)              AS games,
		ROUND(AVG(points), 2) AS points_allowed_pg
		FROM per_game
		GROUP BY season, format, defense, position
)
SELECT d.*,
	ROUND(AVG(d.points_allowed_pg) OVER(PARTITION BY d.season, d.format, d.position), 2) AS league_avg_pg,
	ROUND(d.points_allowed_pg / NULLIF(AVG(d.points_allowed_pg) OVER(PARTITION BY d.season, d.format, d.position), 0), 3) AS matchup_factor,
	RANK() OVER(PARTITION BY d.season, d.format, d.position ORDER BY d.points_allowed_pg DESC) AS softness_rank
	FROM by_defense d;
