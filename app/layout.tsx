import type { Metadata } from "next";
import Link from "next/link";
import { FormatToggle } from "@/components/FormatToggle";
import { Nav } from "@/components/Nav";
import { PlayerSearch } from "@/components/PlayerSearch";
import { getFormat } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Analytics",
  description: "Trending players, rankings, start/sit, and trade analysis built on NFL weekly stats.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const format = await getFormat();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Fantasy Analytics
            </Link>
            <Nav />
            <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
              <PlayerSearch />
              <FormatToggle value={format} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
