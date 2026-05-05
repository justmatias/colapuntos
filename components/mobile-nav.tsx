"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu, LayoutDashboard, CalendarDays, Users, UserCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const iconMap = {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserCircle,
} as const;

type IconName = keyof typeof iconMap;

interface NavLink {
  href: string;
  label: string;
  show: boolean;
  icon?: IconName;
}

interface MobileNavProps {
  links: NavLink[];
}

export function MobileNav({ links }: MobileNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const visible = links.filter((l) => l.show);

  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="sm:hidden flex items-center rounded-md p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        <Menu className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-52 bg-zinc-900 border-zinc-800 text-zinc-100 p-1"
      >
        {visible.map((link) => {
          const isActive = pathname.startsWith(link.href);
          const Icon = link.icon ? iconMap[link.icon] : null;
          return (
            <DropdownMenuItem
              key={link.href}
              onClick={() => router.push(link.href)}
              className={`cursor-pointer flex items-center gap-2.5 py-2.5 px-3 rounded-md transition-colors ${
                isActive
                  ? "text-white bg-zinc-800 font-medium"
                  : "text-zinc-300 hover:text-white focus:bg-zinc-800"
              }`}
            >
              {Icon && (
                <Icon
                  className={`size-4 shrink-0 ${isActive ? "text-red-400" : "text-zinc-500"}`}
                />
              )}
              <span className="flex-1">{link.label}</span>
              {isActive && (
                <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
