"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import {
  ACTIVE_LEAGUE_COOKIE,
  COOKIE_OPTIONS,
  getMyLeagueIds,
  LEAGUES_COOKIE,
  MY_TEAM_COOKIE,
} from "@/lib/league";
import { findUserLeagues, importLeague, type SleeperLeagueSummary } from "@/lib/league-import";
import { publishEdition } from "@/lib/newspaper/publish";

export type FindResult =
  | { ok: true; username: string; userId: string; leagues: SleeperLeagueSummary[] }
  | { ok: false; error: string }
  | null;

export async function findLeagues(_prev: FindResult, form: FormData): Promise<FindResult> {
  const username = String(form.get("username") ?? "").trim();
  if (!username) return { ok: false, error: "Enter your Sleeper username." };
  try {
    const found = await findUserLeagues(username);
    if (!found) return { ok: false, error: `No Sleeper user named “${username}”.` };
    return { ok: true, username: found.user.display_name, userId: found.user.user_id, leagues: found.leagues };
  } catch {
    return { ok: false, error: "Couldn't reach Sleeper. Try again in a minute." };
  }
}

export type AddResult = { error: string } | null;

// Imports the league (this season only, so it's quick), publishes its latest paper, makes it
// this browser's active league, and opens it. `userId` comes from a username search and picks your team.
export async function addLeague(_prev: AddResult, form: FormData): Promise<AddResult> {
  const leagueId = String(form.get("leagueId") ?? "").trim();
  const userId = String(form.get("userId") ?? "").trim();
  if (!/^\d{6,25}$/.test(leagueId)) return { error: "A Sleeper league ID is a long number, like 1363315304968491008." };

  try {
    await importLeague(leagueId);
  } catch (err) {
    const message = (err as Error).message;
    console.error(err);
    return { error: message.startsWith("No Sleeper league") || message.includes("isn't an NFL") ? message : "Couldn't import that league. Try again in a minute." };
  }

  // The paper is a bonus: a league that hasn't finished a week yet simply has none
  try {
    await publishEdition(leagueId);
  } catch (err) {
    console.error(err);
  }

  const jar = await cookies();
  const mine = await getMyLeagueIds();
  jar.set(LEAGUES_COOKIE, [...mine.filter((id) => id !== leagueId), leagueId].join(","), COOKIE_OPTIONS);
  jar.set(ACTIVE_LEAGUE_COOKIE, leagueId, COOKIE_OPTIONS);
  if (userId && /^\d+$/.test(userId)) jar.set(MY_TEAM_COOKIE, userId, COOKIE_OPTIONS);

  revalidatePath("/", "layout");
  redirect("/league");
}

export async function switchLeague(leagueId: string) {
  const [row] = await query(`SELECT 1 FROM leagues WHERE league_id = $1`, [leagueId]);
  if (!row) return;
  const jar = await cookies();
  const mine = await getMyLeagueIds();
  if (!mine.includes(leagueId)) jar.set(LEAGUES_COOKIE, [...mine, leagueId].join(","), COOKIE_OPTIONS);
  jar.set(ACTIVE_LEAGUE_COOKIE, leagueId, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}

// Removes a league from this browser's list. The league's data stays, since other people may follow it.
export async function removeLeague(leagueId: string) {
  const jar = await cookies();
  const rest = (await getMyLeagueIds()).filter((id) => id !== leagueId);
  jar.set(LEAGUES_COOKIE, rest.join(","), COOKIE_OPTIONS);
  if (jar.get(ACTIVE_LEAGUE_COOKIE)?.value === leagueId) {
    if (rest[0]) jar.set(ACTIVE_LEAGUE_COOKIE, rest[0], COOKIE_OPTIONS);
    else jar.delete(ACTIVE_LEAGUE_COOKIE);
  }
  revalidatePath("/", "layout");
}
