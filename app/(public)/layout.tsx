import Link from "next/link";
import { headers } from "next/headers";
import { LayoutDashboard, CalendarDays, Users, UserCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile-nav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  const navLinks = session
    ? [
        { href: "/calendar", label: "Calendario", show: true, icon: CalendarDays },
        { href: "/drivers", label: "Pilotos", show: true, icon: Users },
        { href: "/dashboard", label: "Dashboard", show: true, icon: LayoutDashboard },
        { href: "/profile", label: "Perfil", show: true, icon: UserCircle },
      ]
    : [
        { href: "/calendar", label: "Calendario", show: true, icon: CalendarDays },
        { href: "/drivers", label: "Pilotos", show: true, icon: Users },
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

          <nav className="hidden sm:flex items-center gap-0.5 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-2 sm:px-3 py-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {!session && (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-red-600 hover:bg-red-700 text-white font-semibold"
                )}
              >
                Ingresar
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <MobileNav links={navLinks} />
            {!session && (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "sm:hidden bg-red-600 hover:bg-red-700 text-white font-semibold"
                )}
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-3 sm:px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
