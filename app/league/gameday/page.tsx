import { redirect } from "next/navigation";

// Gameday moved to its own page
export default async function OldGamedayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  redirect(day ? `/gameday?day=${encodeURIComponent(day)}` : "/gameday");
}
