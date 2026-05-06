import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { RaceResult } from "@/lib/models/RaceResult";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GPCountdown } from "./GPCountdown";

const STATUS_ICON: Record<string, string> = {
  completed: "✅",
  past: "🏁",
  closed: "🔒",
  open: "🟢",
  upcoming: "⏳",
  cancelled: "⛔",
};

const WEATHER_EMOJI: Record<"dry" | "wet" | "mixed", string> = {
  dry: "☀️",
  wet: "🌧️",
  mixed: "🌦️",
};

const WEATHER_LABEL: Record<"dry" | "wet" | "mixed", string> = {
  dry: "Carrera seca",
  wet: "Carrera mojada",
  mixed: "Carrera mixta",
};

function computeStatus(
  predictionDeadline: Date,
  raceDate: Date,
  hasResult: boolean
): string {
  if (hasResult) return "completed";
  const now = new Date();
  // 4-hour buffer after raceDate so a race that just finished doesn't immediately flip to "past"
  if (new Date(raceDate.getTime() + 4 * 60 * 60 * 1000) < now) return "past";
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
    cancelled: gp.cancelled ?? false,
    weatherCondition: gp.weatherCondition,
    status: gp.cancelled
      ? "cancelled"
      : computeStatus(
          new Date(gp.predictionDeadline),
          new Date(gp.raceDate),
          resultSet.has(gp._id.toString())
        ),
  }));
}

export default async function CalendarPage() {
  const gpList = await getCalendarData();
  const season = new Date().getFullYear();

  const activeGPs = gpList.filter((g) => !g.cancelled);
  const nextGP = activeGPs.find((g) => g.status === "open" || g.status === "upcoming");
  const completedCount = activeGPs.filter((g) => g.status === "completed").length;
  const pastCount = activeGPs.filter((g) => g.status === "past").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario {season}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          {activeGPs.length} carreras
          {completedCount > 0 && ` · ${completedCount} completadas`}
          {pastCount > 0 && ` · ${pastCount} disputadas`}
        </p>
      </div>

      {nextGP && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{STATUS_ICON[nextGP.status]}</span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm text-zinc-400">Próxima carrera</p>
                <Badge className="bg-amber-700/30 text-amber-400 border border-amber-700/50 text-xs">
                  Siguiente
                </Badge>
              </div>
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
        {gpList.map((gp) => {
          const isNext = nextGP?.id === gp.id;
          return (
          <Link
            key={gp.id}
            href={`/gp/${gp.id}`}
            className={cn(
              "rounded-lg border px-4 py-3.5 flex items-start gap-3 transition-colors",
              gp.cancelled
                ? "border-zinc-800/50 bg-zinc-900/40 opacity-60"
                : isNext
                ? "border-amber-700/60 bg-amber-950/20 hover:border-amber-600/60"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            )}
          >
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <span className="text-zinc-600 font-mono text-xs">{gp.round}</span>
              <span className="text-lg">{STATUS_ICON[gp.status]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {gp.countryFlag && (
                  <img
                    src={gp.countryFlag}
                    alt={gp.country}
                    className={cn("w-5 h-3.5 object-cover rounded-sm shrink-0", gp.cancelled && "grayscale")}
                  />
                )}
                <p className={cn("font-medium text-sm truncate", gp.cancelled ? "text-zinc-500 line-through" : "text-white")}>{gp.name}</p>
                {gp.weatherCondition && !gp.cancelled && (
                  <span className="text-sm shrink-0" title={WEATHER_LABEL[gp.weatherCondition as "dry" | "wet" | "mixed"]}>
                    {WEATHER_EMOJI[gp.weatherCondition as "dry" | "wet" | "mixed"]}
                  </span>
                )}
                {isNext && gp.status === "upcoming" && (
                  <Badge className="shrink-0 bg-amber-700/30 text-amber-400 border border-amber-700/50 text-xs">
                    Próximo
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-500 truncate">{gp.circuit}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {new Date(gp.raceDate).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <div className="shrink-0 pt-0.5">
              {gp.cancelled && (
                <Badge className="bg-red-950/50 text-red-400/70 border border-red-900/40 text-xs">No disponible</Badge>
              )}
              {!gp.cancelled && gp.status === "open" && (
                <Badge className="bg-green-700/30 text-green-400 border border-green-700/50 text-xs">
                  Abierto
                </Badge>
              )}
              {!gp.cancelled && isNext && gp.status === "upcoming" && (
                <div className="text-right">
                  <GPCountdown
                    deadline={new Date(gp.predictionDeadline).toISOString()}
                    timezone={gp.timezone}
                  />
                </div>
              )}
              {!gp.cancelled && !isNext && gp.status === "upcoming" && (
                <Badge className="bg-zinc-800 text-zinc-600 text-xs">Próximo</Badge>
              )}
              {!gp.cancelled && gp.status === "closed" && (
                <Badge className="bg-zinc-800 text-zinc-400 text-xs">Cerrado</Badge>
              )}
              {!gp.cancelled && gp.status === "past" && (
                <Badge className="bg-zinc-800 text-zinc-500 text-xs">Sin resultado</Badge>
              )}
              {!gp.cancelled && gp.status === "completed" && (
                <Badge className="bg-zinc-800 text-zinc-400 text-xs">Completado</Badge>
              )}
            </div>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
