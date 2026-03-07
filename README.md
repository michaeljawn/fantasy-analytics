# Fantasy Football Analytics

**Personal Project | PostgreSQL, SQL**

Analyze and rank NFL offensive players based on fantasy performance. This project demonstrates end-to-end database design, data ingestion, scoring logic, and analytics queries.

---

## Project Overview

This project simulates a **fantasy football analytics engine**:

- Stores **player information**, **weekly stats**, and **calculated fantasy points**.  
- Calculates **PPR (point-per-reception)** and **standard fantasy points**.  
- Generates **weekly rankings, positional leaderboards, average points, and consistency metrics**.  
- Designed to showcase **SQL skills** including table design, constraints, indexes, joins, aggregates, and window functions.

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `players` | Stores player info (name, position, team). Primary key: `player_id`. |
| `weekly_stats` | Stores weekly performance stats (passing, rushing, receiving, turnovers). Linked to `players` via `player_id`. |
| `fantasy_points` | Stores calculated PPR and standard fantasy points per player per week. Linked to `weekly_stats` via `player_id` and `week`. |

---
