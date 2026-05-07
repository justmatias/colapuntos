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
                "relative px-2 sm:px-3 py-1.5 rounded-md transition-colors",
                isActive
                  ? "text-white font-semibold after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-red-500 after:content-['']"
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
