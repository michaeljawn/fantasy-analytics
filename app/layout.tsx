import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { bodyFont, displayFont } from "@/components/fonts";
import { FormatToggle } from "@/components/FormatToggle";
import { GamedayButton, Nav } from "@/components/Nav";
import { PlayerSearch } from "@/components/PlayerSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavProgress, PageTransition } from "@/components/Transitions";
import { getFormat } from "@/lib/format";
import { getLiveGameCount } from "@/lib/gameday";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Front Office", template: "%s · The Front Office" },
  description:
    "Your fantasy league's front office: standings, a weekly league paper, gameday across all your leagues, trending players, rankings, start/sit, and trade analysis.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [format, jar, liveGames] = await Promise.all([getFormat(), cookies(), getLiveGameCount()]);
  const theme = jar.get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme} className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Suspense>
          <NavProgress />
        </Suspense>
        <header className="site-header sticky top-0 z-20">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
            <div className="flex w-full items-center justify-between gap-3 lg:w-auto">
              <Wordmark />
              <GamedayButton liveGames={liveGames} className="inline-flex lg:hidden" />
            </div>
            <Nav />
            <div className="flex w-full items-center gap-2.5 pb-1 sm:w-auto lg:ml-auto lg:pb-0">
              <GamedayButton liveGames={liveGames} className="hidden lg:inline-flex" />
              <PlayerSearch />
              <FormatToggle value={format} />
              <ThemeToggle initial={theme} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="The Front Office, home">
      <span className="slant grid h-7 place-items-center bg-accent px-2.5 font-display text-base font-extrabold text-on-accent italic transition group-hover:shadow-[0_0_18px_-2px_var(--accent-glow)]">
        FO
      </span>
      <span className="font-display text-lg leading-none font-bold tracking-wide uppercase italic">The Front Office</span>
    </Link>
  );
}
