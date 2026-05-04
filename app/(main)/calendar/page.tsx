import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { RaceResult } from "@/lib/models/RaceResult";
import { Badge } from "@/components/ui/badge";
import { GPCountdown } from "./GPCountdown";

const STATUS_ICON: Record<string, string> = {
  completed: "✅",
  closed: "🔒",
  open: "🟢",
  upcoming: "⏳",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completado",
  closed: "Cerrado",
  open: "Abierto",
  upcoming: "Próximo",
};

function computeStatus(
  predictionDeadline: Date,
  raceDate: Date,
  hasResult: boolean
): string {
  if (hasResult) return "completed";
  const now = new Date();
  if (predictionDeadline < now) return "closed";
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  if (predictionDeadline <= in48h) return "open";
  return "upcoming";
}

async function getCalendarData() {
  await connectDB();

  const season = new Date().getFullYear();
  const gps = await GrandPrix.find({ season }).sort({ round: 1 }).lean();

  const gpIds = gps.map((g) => g._id);
  const results = await RaceResult.find({ grandPrix: { $in: gpIds } })
    .select("grandPrix")
    .lean();
  const resultSet = new Set(results.map((r) => r.grandPrix.toString()));

  return gps.map((gp) => ({
    id: gp._id.toString(),
    round: gp.round,
    name: gp.name,
    country: gp.country,
    circuit: gp.circuit,
    raceDate: gp.raceDate,
    predictionDeadline: gp.predictionDeadline,
    timezone: gp.timezone,
    countryFlag: gp.countryFlag,
    circuitImage: gp.circuitImage,
    status: computeStatus(
      new Date(gp.predictionDeadline),
      new Date(gp.raceDate),
      resultSet.has(gp._id.toString())
    ),
  }));
}

export default async function CalendarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const gpList = await getCalendarData();
  const season = new Date().getFullYear();

  const nextGP = gpList.find((g) => g.status === "open" || g.status === "upcoming");
  const completedCount = gpList.filter((g) => g.status === "completed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario {season}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          {gpList.length} carreras · {completedCount} completadas
        </p>
      </div>

      {nextGP && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{STATUS_ICON[nextGP.status]}</span>
            <div>
              <p className="text-sm text-zinc-400">Próxima carrera</p>
              <p className="font-semibold text-white">
                R{nextGP.round} — {nextGP.name}
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(nextGP.raceDate).toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500 mb-0.5">Cierre de predicciones</p>
            <GPCountdown
              deadline={new Date(nextGP.predictionDeadline).toISOString()}
              timezone={nextGP.timezone}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {gpList.map((gp) => (
          <div
            key={gp.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3.5 flex items-start gap-3 hover:border-zinc-700 transition-colors"
          >
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <span className="text-zinc-600 font-mono text-xs">{gp.round}</span>
              <span className="text-lg">{STATUS_ICON[gp.status]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-sm truncate">{gp.name}</p>
              <p className="text-xs text-zinc-500 truncate">{gp.circuit}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {new Date(gp.raceDate).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
              {gp.countryFlag && (
                <span className="text-xs text-zinc-600 block mt-1">
                  {gp.countryFlag} {gp.country}
                </span>
              )}
            </div>
            <div className="shrink-0 pt-0.5">
              {gp.status === "open" && (
                <Badge className="bg-green-700/30 text-green-400 border border-green-700/50 text-xs">
                  Abierto
                </Badge>
              )}
              {gp.status === "upcoming" && (
                <div className="text-right">
                  <GPCountdown
                    deadline={new Date(gp.predictionDeadline).toISOString()}
                    timezone={gp.timezone}
                  />
                </div>
              )}
              {gp.status === "closed" && (
                <Badge className="bg-zinc-800 text-zinc-400 text-xs">Cerrado</Badge>
              )}
              {gp.status === "completed" && (
                <Badge className="bg-zinc-800 text-zinc-400 text-xs">Completado</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
