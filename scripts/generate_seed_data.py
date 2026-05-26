"""
generate_seed_data.py
=====================
Fetches NFL player stats from the Sleeper API and generates a seed_data.sql
file compatible with the Fantasy Football Analytics database schema.

Usage:
    python generate_seed_data.py --season 2024 --weeks 1-18
    python generate_seed_data.py --season 2024 --weeks 1-4 --players "Jalen Hurts,Josh Allen"
    python generate_seed_data.py --season 2024 --weeks 1-18 --positions QB,RB,WR --top 20

The Sleeper API is free, public, and requires no authentication.
Rate limit: stay under 1000 calls/min to avoid IP bans.

Docs: https://docs.sleeper.com
"""

import argparse
import json
import sys
import time
from typing import Optional
import urllib.request
import urllib.error

# ──────────────────────────────────────────────
# Sleeper API helpers
# ──────────────────────────────────────────────

BASE_URL = "https://api.sleeper.app/v1"
STATS_URL_V1 = "https://api.sleeper.app/v1/stats/nfl/regular"   # newer working format
STATS_URL_V2 = "https://api.sleeper.com/stats/nfl"              # older format (deprecated)

POSITIONS = ["QB", "RB", "WR", "TE", "K"]

# Sleeper stat field → our schema column
# Sleeper uses abbreviated keys inside each player's stats dict.
STAT_MAP = {
    "pass_yd":    "passing_yds",
    "pass_td":    "passing_tds",
    "pass_int":   "interceptions",
    "rush_yd":    "rushing_yds",
    "rush_td":    "rushing_tds",
    "rec":        "receptions",
    "rec_yd":     "receiving_yds",
    "rec_td":     "receiving_tds",
    "fum_lost":   "fumbles_lost",
}


def fetch_json(url: str, retries: int = 3, delay: float = 1.5) -> dict | list:
    """Fetch JSON from a URL with simple retry logic."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FantasyAnalyticsBot/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} on {url}", file=sys.stderr)
            if e.code == 429:
                print("  Rate-limited — waiting 10 s …", file=sys.stderr)
                time.sleep(10)
            elif attempt == retries - 1:
                raise
            time.sleep(delay * (attempt + 1))
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"  Error ({e}), retrying …", file=sys.stderr)
            time.sleep(delay * (attempt + 1))


def fetch_all_players() -> dict:
    """
    Returns Sleeper's full player registry as {player_id: player_info}.
    This endpoint is large (~5 MB) — call it once and cache locally.
    """
    print("Fetching full player registry from Sleeper (this may take a moment)…")
    url = f"{BASE_URL}/players/nfl"
    return fetch_json(url)


def fetch_week_stats(season: int, week: int) -> dict:
    """
    Returns stats for ALL players for a given season/week.
    Returns {player_id: {stat_key: value, …}, …}
    Tries the v1 endpoint first, falls back to the older URL format.
    """
    urls = [
        f"{STATS_URL_V1}/{season}/{week}",
        f"{STATS_URL_V2}/{season}/{week}?season_type=regular",
    ]
    last_error = None
    for url in urls:
        try:
            result = fetch_json(url)
            if isinstance(result, dict) and result:
                return result
        except Exception as e:
            last_error = e
            continue
    if last_error:
        raise last_error
    return {}


# ──────────────────────────────────────────────
# Data parsing
# ──────────────────────────────────────────────

def parse_weeks(weeks_str: str) -> list[int]:
    """Parse '1-4' or '1,3,5' or '1-4,6' into a sorted list of ints."""
    weeks = set()
    for part in weeks_str.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-")
            weeks.update(range(int(start), int(end) + 1))
        else:
            weeks.add(int(part))
    return sorted(weeks)


def parse_positions(positions_str: Optional[str]) -> list[str]:
    if not positions_str:
        return POSITIONS
    return [p.strip().upper() for p in positions_str.split(",")]


def extract_player_stats(raw_stats: dict) -> dict[str, int]:
    """Map Sleeper stat keys → our schema columns, defaulting to 0."""
    out = {col: 0 for col in STAT_MAP.values()}
    for sleeper_key, db_col in STAT_MAP.items():
        val = raw_stats.get(sleeper_key, 0) or 0
        out[db_col] = int(round(val))
    return out


# ──────────────────────────────────────────────
# SQL generation
# ──────────────────────────────────────────────

def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def build_sql(
    season: int,
    weeks: list[int],
    target_names: Optional[list[str]],
    positions: list[str],
    top_n: Optional[int],
    output_path: str,
) -> None:
    # 1. Fetch player registry
    all_players = fetch_all_players()

    # 2. Filter by position first to build our working set
    filtered = {
        pid: info
        for pid, info in all_players.items()
        if info.get("position") in positions and info.get("active")
    }

    # 3. If specific player names were given, narrow further
    if target_names:
        name_set = {n.lower() for n in target_names}
        filtered = {
            pid: info for pid, info in filtered.items()
            if f"{info.get('first_name','')} {info.get('last_name','')}".lower() in name_set
        }
        if not filtered:
            sys.exit(
                "No matching players found. "
                "Check spelling — use full names like 'Jalen Hurts,Josh Allen'."
            )

    print(f"Working player pool: {len(filtered)} players across positions {positions}")

    # 4. Fetch weekly stats for each requested week
    #    Structure: { week: { player_id: {stat_col: int} } }
    weekly_data: dict[int, dict[str, dict]] = {}

    weeks_with_data = []
    for week in weeks:
        print(f"  Fetching week {week} stats …")
        raw = fetch_week_stats(season, week)
        if not isinstance(raw, dict) or not raw:
            print(f"  ⚠ No data returned for week {week} — season {season} may not have started yet. Skipping.")
            continue
        weekly_data[week] = {}
        weeks_with_data.append(week)
        for pid, stats_blob in raw.items():
            if pid in filtered:
                weekly_data[week][pid] = extract_player_stats(stats_blob)
        time.sleep(0.2)   # be polite

    if not weeks_with_data:
        sys.exit(
            f"\n✗ No stats found for season {season}. "
            "The season may not have started yet. "
            "Try --season 2024 for the most recent completed season."
        )
    weeks = weeks_with_data

    # 5. If top_n requested, rank by total PPR points across fetched weeks and keep top N
    if top_n:
        def total_ppr(pid: str) -> float:
            total = 0.0
            for wk in weeks:
                s = weekly_data.get(wk, {}).get(pid)
                if not s:
                    continue
                total += (
                    s["passing_yds"] / 25.0
                    + s["passing_tds"] * 4
                    + s["rushing_yds"] / 10.0
                    + s["rushing_tds"] * 6
                    + s["receptions"]               # PPR
                    + s["receiving_yds"] / 10.0
                    + s["receiving_tds"] * 6
                    - s["interceptions"] * 2
                    - s["fumbles_lost"] * 2
                )
            return total

        ranked = sorted(filtered.keys(), key=total_ppr, reverse=True)[:top_n]
        filtered = {pid: filtered[pid] for pid in ranked}
        print(f"  Kept top {top_n} players by PPR points.")

    # 6. Assign sequential player_ids (1-based) for the SQL insert
    ordered_pids = sorted(filtered.keys())   # stable ordering
    pid_to_seq = {pid: i + 1 for i, pid in enumerate(ordered_pids)}

    # 7. Write SQL
    lines = []
    lines.append(f"-- Fantasy Football Analytics Database")
    lines.append(f"-- Season: {season}  |  Weeks: {weeks[0]}–{weeks[-1]}")
    lines.append(f"-- Generated by generate_seed_data.py via Sleeper API")
    lines.append("")
    lines.append("-- Reset Tables for Clean Seed")
    lines.append("TRUNCATE TABLE fantasy_points, weekly_stats, players RESTART IDENTITY CASCADE;")
    lines.append("")

    # Players
    lines.append("-- Insert Players")
    lines.append("INSERT INTO players")
    lines.append("(first_name, last_name, position, team)")
    lines.append("\tVALUES")

    player_rows = []
    for pid in ordered_pids:
        info = filtered[pid]
        fn  = sql_escape(info.get("first_name", "Unknown"))
        ln  = sql_escape(info.get("last_name", "Unknown"))
        pos = sql_escape(info.get("position", ""))
        team = sql_escape(info.get("team", "FA") or "FA")
        player_rows.append(f"\t('{fn}', '{ln}', '{pos}', '{team}')")

    lines.append(",\n".join(player_rows) + ";")
    lines.append("")

    # Weekly stats — one INSERT block per week
    stat_cols = list(STAT_MAP.values())
    for week in weeks:
        lines.append(f"-- Week {week} Stats")
        lines.append("INSERT INTO weekly_stats")
        lines.append(
            "(player_id, week, "
            + ", ".join(stat_cols)
            + ")"
        )
        lines.append("\tVALUES")

        week_rows = []
        for pid in ordered_pids:
            seq_id = pid_to_seq[pid]
            stats = weekly_data.get(week, {}).get(pid)
            if stats is None:
                # Player had no stats this week (bye/inactive) — insert zeros
                stats = {col: 0 for col in stat_cols}
            vals = ", ".join(str(stats[col]) for col in stat_cols)
            week_rows.append(f"\t({seq_id},{week},{vals})")

        lines.append(",\n".join(week_rows) + ";")
        lines.append("")

    sql_text = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(sql_text)

    print(f"\n✓ Wrote {output_path}")
    print(f"  Players : {len(ordered_pids)}")
    print(f"  Weeks   : {weeks}")
    print(f"  Season  : {season}")


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate seed_data.sql from the Sleeper NFL stats API."
    )
    parser.add_argument(
        "--season", type=int, required=True,
        help="NFL season year (e.g. 2024)"
    )
    parser.add_argument(
        "--weeks", default="1-18",
        help="Weeks to include. Range (1-4), list (1,3,5), or mixed (1-4,6). Default: 1-18"
    )
    parser.add_argument(
        "--positions", default=None,
        help=f"Comma-separated positions to include. Default: {','.join(POSITIONS)}"
    )
    parser.add_argument(
        "--players", default=None,
        help="Optional comma-separated full player names to filter to (e.g. 'Jalen Hurts,Josh Allen')"
    )
    parser.add_argument(
        "--top", type=int, default=None,
        help="Keep only the top N players by total PPR points (across fetched weeks)"
    )
    parser.add_argument(
        "--output", default="seed_data.sql",
        help="Output file path (default: seed_data.sql)"
    )

    args = parser.parse_args()

    weeks     = parse_weeks(args.weeks)
    positions = parse_positions(args.positions)
    players   = [p.strip() for p in args.players.split(",")] if args.players else None

    build_sql(
        season=args.season,
        weeks=weeks,
        target_names=players,
        positions=positions,
        top_n=args.top,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()
