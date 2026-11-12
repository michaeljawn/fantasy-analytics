"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Kickoff time in the viewer's own time zone (the server doesn't know it)
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }, [iso]);
  return <span suppressHydrationWarning>{text ?? " "}</span>;
}

// Re-renders the page every so often while games are on
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
