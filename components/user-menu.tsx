"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

interface Props {
  name: string;
  email: string;
  headshotUrl?: string;
}

export function UserMenu({ name, email, headshotUrl }: Props) {
  const router = useRouter();
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer">
        <Avatar className="h-8 w-8">
          <AvatarImage src={headshotUrl} alt={name} />
          <AvatarFallback className="bg-red-700 text-white text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800 text-zinc-100">
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">{name}</p>
          <p className="text-xs text-zinc-400 truncate">{email}</p>
        </div>
        <DropdownMenuSeparator className="bg-zinc-800" />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-zinc-300 hover:text-white focus:bg-zinc-800"
        >
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
