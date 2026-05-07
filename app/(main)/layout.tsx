import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/lib/models/User";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { user } = session;

  await connectDB();
  const dbUser = await User.findById(new Types.ObjectId(user.id))
    .select("favoriteDriverHeadshot")
    .lean();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", show: true, icon: "LayoutDashboard" as const },
    { href: "/calendar", label: "Calendario", show: true, icon: "CalendarDays" as const },
    { href: "/drivers", label: "Pilotos", show: true, icon: "Users" as const },
    { href: "/profile", label: "Perfil", show: true, icon: "UserCircle" as const },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-red-500 font-black text-lg tracking-tight">
              COLA<span className="text-white">PUNTOS</span>
            </span>
          </Link>

          <NavLinks links={navLinks} />

          <div className="flex items-center gap-2">
            <MobileNav links={navLinks} />
            <UserMenu
              name={user.name}
              email={user.email}
              headshotUrl={dbUser?.favoriteDriverHeadshot ?? undefined}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-3 sm:px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
