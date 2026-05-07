"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  show: boolean;
};

export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden sm:flex items-center gap-0.5 text-sm">
      {links
        .filter((l) => l.show)
        .map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-2 sm:px-3 py-1.5 rounded-md transition-colors",
                isActive
                  ? "text-white bg-zinc-800 font-medium"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              {link.label}
            </Link>
          );
        })}
    </nav>
  );
}
