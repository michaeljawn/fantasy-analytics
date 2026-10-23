"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/trending", label: "Trending" },
  { href: "/rankings", label: "Rankings" },
  { href: "/start-sit", label: "Start/Sit" },
  { href: "/trade", label: "Trade" },
  { href: "/matchups", label: "Matchups" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2.5 py-1.5 whitespace-nowrap ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
