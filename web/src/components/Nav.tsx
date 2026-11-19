"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Match Graphics" },
  { href: "/hrs", label: "Sell Sheets" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-4xl gap-1 px-4 py-2 sm:px-6">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-logo text-accent" : "text-muted hover:text-fg"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
