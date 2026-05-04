import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { DateTime } from "luxon";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { Prediction } from "@/lib/models/Prediction";
import { PredictForm } from "./PredictForm";

export default async function PredictPage({
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

  const isOpen = new Date() < new Date(gp.predictionDeadline);

  const [drivers, existingPrediction] = await Promise.all([
    Driver.find({ season: tournament.season, active: true }).sort({ lastName: 1 }).lean(),
    Prediction.findOne({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      grandPrix: new Types.ObjectId(gpId),
    }).lean(),
  ]);

  const deadlineLabel = DateTime.fromJSDate(new Date(gp.predictionDeadline))
    .setZone(gp.timezone)
    .setLocale("es")
    .toFormat("cccc d 'de' LLLL, HH:mm");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
          <Link
            href={`/tournaments/${tournamentId}`}
            className="hover:text-zinc-300 transition-colors"
          >
            {tournament.name}
          </Link>
          <span>/</span>
          <span>Predicción</span>
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

      <PredictForm
        tournamentId={tournamentId}
        gpId={gpId}
        drivers={drivers.map((d) => ({
          id: d._id.toString(),
          code: d.code,
          fullName: d.fullName,
          team: d.team,
          teamColour: d.teamColour,
          number: d.number,
        }))}
        existing={
          existingPrediction
            ? {
                p1: existingPrediction.p1.toString(),
                p2: existingPrediction.p2.toString(),
                p3: existingPrediction.p3.toString(),
              }
            : null
        }
        isOpen={isOpen}
        deadlineLabel={deadlineLabel}
      />
    </div>
  );
}
