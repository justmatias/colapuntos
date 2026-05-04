import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/lib/models/User";
import { UserMenu } from "@/components/user-menu";

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="text-red-500 font-black text-lg tracking-tight">
              COLA<span className="text-white">PUNTOS</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Dashboard
            </Link>
          </nav>

          <UserMenu
            name={user.name}
            email={user.email}
            headshotUrl={dbUser?.favoriteDriverHeadshot ?? undefined}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
