import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Types } from "mongoose";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { Prediction } from "@/lib/models/Prediction";
import { RaceResult } from "@/lib/models/RaceResult";
import { Score } from "@/lib/models/Score";
import { User } from "@/lib/models/User";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/back-link";

const POSITION_LABELS = ["P1", "P2", "P3"] as const;

type Classification = "exact" | "partial" | "miss" | "unknown";

function classify(
  driverId: string,
  result: { p1: string; p2: string; p3: string } | null,
  position: number
): Classification {
  if (!result) return "unknown";
  const podium = [result.p1, result.p2, result.p3];
  if (podium[position] === driverId) return "exact";
  if (podium.includes(driverId)) return "partial";
  return "miss";
}

const CELL_CLASS: Record<Classification, string> = {
  exact: "bg-green-500/20 text-green-300 border border-green-500/30",
  partial: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  miss: "bg-zinc-800/50 text-zinc-500 border border-transparent",
  unknown: "text-zinc-300 border border-transparent",
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; gpId: string }>;
}) {
  const { id: tournamentId, gpId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  await connectDB();

  const [tournament, gp] = await Promise.all([
    Tournament.findById(tournamentId).lean(),
    GrandPrix.findById(gpId).lean(),
  ]);

  if (!tournament || !gp) notFound();

  const isMember = (tournament.members as Types.ObjectId[]).some(
    (m) => m.toString() === session.user.id
  );
  if (!isMember) notFound();

  const isPostDeadline = new Date() > new Date(gp.predictionDeadline);

  const [raceResult, ownPrediction, drivers] = await Promise.all([
    RaceResult.findOne({ grandPrix: new Types.ObjectId(gpId) }).lean(),
    Prediction.findOne({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      grandPrix: new Types.ObjectId(gpId),
    }).lean(),
    Driver.find({ season: tournament.season }).select("fullName teamColour code").lean(),
  ]);

  const driverMap = new Map(
    drivers.map((d) => [d._id.toString(), { fullName: d.fullName as string, teamColour: d.teamColour as string | undefined, code: d.code as string | undefined }])
  );
  const driverName = (id: string) => driverMap.get(id)?.fullName ?? "—";
  const driverCode = (id: string) => driverMap.get(id)?.code ?? driverMap.get(id)?.fullName?.split(" ").pop()?.slice(0, 3).toUpperCase() ?? "—";
  const driverColour = (id: string) => driverMap.get(id)?.teamColour ?? undefined;

  const result = raceResult
    ? {
        p1: raceResult.p1.toString(),
        p2: raceResult.p2.toString(),
        p3: raceResult.p3.toString(),
      }
    : null;

  type PredRow = {
    userId: string;
    userName: string;
    p1: string;
    p2: string;
    p3: string;
    score?: number;
  };

  let allPredictions: PredRow[] = [];

  if (isPostDeadline) {
    const [predictions, scores] = await Promise.all([
      Prediction.find({
        tournament: new Types.ObjectId(tournamentId),
        grandPrix: new Types.ObjectId(gpId),
      }).lean(),
      Score.find({
        tournament: new Types.ObjectId(tournamentId),
        grandPrix: new Types.ObjectId(gpId),
      }).lean(),
    ]);

    const userIds = predictions.map((p) => p.user);
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name")
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u.name as string]));
    const scoreMap = new Map(scores.map((s) => [s.user.toString(), s.points]));

    allPredictions = predictions.map((p) => ({
      userId: p.user.toString(),
      userName: userMap.get(p.user.toString()) ?? "—",
      p1: p.p1.toString(),
      p2: p.p2.toString(),
      p3: p.p3.toString(),
      score: scoreMap.get(p.user.toString()),
    }));

    allPredictions.sort((a, b) => {
      if (result) {
        const diff = (b.score ?? 0) - (a.score ?? 0);
        if (diff !== 0) return diff;
      }
      return a.userName.localeCompare(b.userName);
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <BackLink href={`/tournaments/${tournamentId}`} label="Volver al torneo" />
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
          <Link
            href={`/tournaments/${tournamentId}`}
            className="hover:text-zinc-300 transition-colors"
          >
            {tournament.name}
          </Link>
          <span>/</span>
          <span>Resultados</span>
        </div>
        <h1 className="text-2xl font-bold">{gp.name}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Ronda {gp.round} ·{" "}
          {new Date(gp.raceDate).toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {result && (
        <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Podio oficial</h2>
          <div className="space-y-2">
            {[result.p1, result.p2, result.p3].map((id, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-bold text-sm text-zinc-400 w-6">
                  {POSITION_LABELS[i]}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: driverColour(id) ?? "#666" }}
                />
                <span className="font-medium">{driverName(id)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isPostDeadline && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-yellow-700/50 bg-yellow-700/10 px-4 py-3">
            <span className="text-lg">⏳</span>
            <div>
              <p className="font-medium text-sm text-yellow-400">El plazo aún no cerró</p>
              <p className="text-xs text-zinc-500">
                Las predicciones de los demás se revelarán cuando cierre.
              </p>
            </div>
          </div>

          {ownPrediction ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-zinc-400">Tu predicción</h2>
              {[ownPrediction.p1, ownPrediction.p2, ownPrediction.p3].map(
                (driverId, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
                  >
                    <span className="font-bold text-sm text-zinc-400 w-6">
                      {POSITION_LABELS[i]}
                    </span>
                    <span>{driverName(driverId.toString())}</span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-zinc-500 mb-3">
                No hiciste una predicción para esta carrera.
              </p>
              <Link
                href={`/tournaments/${tournamentId}/gp/${gpId}/predict`}
                className={cn(buttonVariants(), "bg-red-600 hover:bg-red-700 text-white")}
              >
                Hacer predicción →
              </Link>
            </div>
          )}
        </div>
      )}

      {isPostDeadline && !result && new Date() > new Date(gp.raceDate) && (() => {
        const estimatedAt = new Date(new Date(gp.raceDate).getTime() + 5 * 60 * 60 * 1000);
        const isPast = estimatedAt < new Date();
        const timeStr = new Intl.DateTimeFormat("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: gp.timezone,
          timeZoneName: "short",
        }).format(estimatedAt);
        return (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
            <span className="text-lg">⏳</span>
            <div>
              <p className="font-medium text-sm text-zinc-300">Resultados pendientes</p>
              <p className="text-xs text-zinc-500">
                {isPast
                  ? "Sincronizando resultados, volvé en unos minutos…"
                  : `Disponibles aproximadamente a las ${timeStr}`}
              </p>
            </div>
          </div>
        );
      })()}

      {isPostDeadline && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Predicciones del grupo</h2>

          {allPredictions.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Nadie hizo una predicción para esta carrera.
            </p>
          ) : (
            <div className="space-y-3">
              {result && (
                <div className="flex items-center gap-4 text-xs text-zinc-500 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500/40" />
                    Exacto
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-500/30 border border-yellow-500/40" />
                    En el podio
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-800 border border-zinc-700" />
                    Fuera
                  </span>
                </div>
              )}
              {allPredictions.map((pred) => (
                <div
                  key={pred.userId}
                  className={`rounded-lg border p-4 ${
                    pred.userId === session.user.id
                      ? "border-zinc-600 bg-zinc-800/50"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{pred.userName}</span>
                      {pred.userId === session.user.id && (
                        <span className="text-xs text-zinc-500">(vos)</span>
                      )}
                    </div>
                    {pred.score !== undefined && (
                      <Badge
                        className={cn(
                          "font-bold",
                          pred.score >= 15
                            ? "bg-green-700/40 text-green-300"
                            : pred.score >= 8
                            ? "bg-amber-700/40 text-amber-300"
                            : "bg-zinc-700 text-zinc-400"
                        )}
                      >
                        {pred.score} pts
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[pred.p1, pred.p2, pred.p3].map((driverId, i) => {
                      const cls = classify(driverId, result, i);
                      return (
                        <div
                          key={i}
                          className={`rounded-md px-2 py-1.5 text-center ${CELL_CLASS[cls]}`}
                        >
                          <div className="text-xs font-bold mb-0.5">
                            {POSITION_LABELS[i]}
                          </div>
                          <div className="text-xs font-mono leading-tight">
                            {driverCode(driverId)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
