import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { bodyFont, displayFont } from "@/components/fonts";
import { FormatToggle } from "@/components/FormatToggle";
import { Nav } from "@/components/Nav";
import { PlayerSearch } from "@/components/PlayerSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getFormat } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Front Office", template: "%s · The Front Office" },
  description:
    "Your fantasy league's front office: standings, a weekly league paper, trending players, rankings, start/sit, and trade analysis.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [format, jar] = await Promise.all([getFormat(), cookies()]);
  const theme = jar.get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme} className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-page/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Wordmark />
            <Nav />
            <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
              <PlayerSearch />
              <FormatToggle value={format} />
              <ThemeToggle initial={theme} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="The Front Office, home">
      <span className="slant grid h-7 place-items-center bg-accent px-2.5 font-display text-base font-extrabold text-on-accent italic transition group-hover:brightness-110">
        FO
      </span>
      <span className="font-display text-lg leading-none font-bold tracking-wide uppercase italic">
        The Front Office
      </span>
    </Link>
  );
}
