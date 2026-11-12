import { notFound } from "next/navigation";
import { EditionPage } from "../EditionPage";

export const metadata = { title: "League paper" };

export default async function WeekEditionPage({ params }: { params: Promise<{ week: string }> }) {
  const week = Number((await params).week);
  if (!Number.isInteger(week) || week < 1) notFound();
  return <EditionPage week={week} />;
}
