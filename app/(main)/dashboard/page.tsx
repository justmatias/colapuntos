import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { Score } from "@/lib/models/Score";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Types } from "mongoose";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function getDashboardData(userId: string) {
  await connectDB();
  const objectId = new Types.ObjectId(userId);

  const tournaments = await Tournament.find({ members: objectId }).lean();

  const tournamentIds = tournaments.map((t) => t._id);

  const scoreAgg = await Score.aggregate([
    { $match: { user: objectId, tournament: { $in: tournamentIds } } },
    { $group: { _id: "$tournament", total: { $sum: "$points" } } },
  ]);
  const pointsMap = new Map<string, number>(
    scoreAgg.map((s) => [s._id.toString(), s.total])
  );

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const urgentGPs = await GrandPrix.find({
    predictionDeadline: { $gt: now, $lte: in48h },
  })
    .sort({ predictionDeadline: 1 })
    .lean();

  return {
    tournaments: tournaments.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      season: t.season,
      memberCount: t.members.length,
      points: pointsMap.get(t._id.toString()) ?? 0,
      isCreator: t.creator.toString() === userId,
    })),
    urgentGPs,
  };
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { tournaments, urgentGPs } = await getDashboardData(session.user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Mis torneos</h1>
        <div className="flex gap-2">
          <Link href="/tournaments/join" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Unirme
          </Link>
          <Link href="/tournaments/new" className={cn(buttonVariants({ size: "sm" }), "bg-red-600 hover:bg-red-700 text-white")}>
            Nuevo torneo
          </Link>
        </div>
      </div>

      {urgentGPs.length > 0 && (
        <div className="rounded-lg border border-yellow-600/40 bg-yellow-600/10 px-4 py-3 text-sm text-yellow-300">
          <span className="font-semibold">¡Deadline próximo!</span>{" "}
          {urgentGPs.map((gp) => (
            <span key={gp._id.toString()}>
              {gp.name} — cierra{" "}
              {new Date(gp.predictionDeadline).toLocaleString("es-AR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ))}
        </div>
      )}

      {tournaments.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
          <p className="text-zinc-400 mb-4">Todavía no pertenecés a ningún torneo.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/tournaments/join" className={buttonVariants({ variant: "outline" })}>
              Unirme con código
            </Link>
            <Link href="/tournaments/new" className={cn(buttonVariants(), "bg-red-600 hover:bg-red-700 text-white")}>
              Crear torneo
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}>
              <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-white leading-tight">
                      {t.name}
                    </CardTitle>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                        {t.season}
                      </Badge>
                      {t.isCreator && (
                        <Badge className="bg-red-700 text-white text-xs">Admin</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-end justify-between">
                  <p className="text-zinc-500 text-sm">{t.memberCount} participantes</p>
                  <p className="text-2xl font-black text-white">
                    {t.points} <span className="text-sm font-normal text-zinc-400">pts</span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
