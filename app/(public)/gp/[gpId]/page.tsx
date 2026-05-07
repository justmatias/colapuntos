import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { RaceResult } from "@/lib/models/RaceResult";
import { SessionResult } from "@/lib/models/SessionResult";
import { getSessionResults } from "@/lib/session-results";
import { fetchSessionsForMeeting, type OpenF1Session } from "@/lib/openf1";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const SESSION_NAME_ICON: Record<string, string> = {
  Race: "🏁",
  Qualifying: "⏱",
  Sprint: "⚡",
  "Sprint Qualifying": "⚡⏱",
  "Sprint Shootout": "⚡⏱",
  "Practice 1": "🔧",
  "Practice 2": "🔧",
  "Practice 3": "🔧",
};

function sessionIcon(name: string): string {
  return SESSION_NAME_ICON[name] ?? "📋";
}

async function getGPData(gpId: string) {
  await connectDB();

  const gp = await GrandPrix.findById(gpId).lean();
  if (!gp) return null;

  // Fetch sessions from OpenF1
  let sessions: OpenF1Session[] = [];
  if (gp.meetingKey) {
    try {
      sessions = await fetchSessionsForMeeting(gp.meetingKey);
      sessions.sort(
        (a, b) =>
          new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
      );
    } catch {
      // API unavailable, show page without sessions
    }
  }

  // Local driver map for RaceResult resolution
  const drivers = await Driver.find({ season: gp.season, active: true }).lean();
  const driverById = new Map(drivers.map((d) => [d._id.toString(), d]));

  const localRaceResult = await RaceResult.findOne({ grandPrix: gp._id }).lean();

  const localResult = localRaceResult
    ? {
        p1: driverById.get((localRaceResult.p1 as Types.ObjectId).toString()),
        p2: driverById.get((localRaceResult.p2 as Types.ObjectId).toString()),
        p3: driverById.get((localRaceResult.p3 as Types.ObjectId).toString()),
      }
    : null;

  const now = new Date();

  // For each past session, get results from DB or sync from OpenF1.
  // Sequential (not concurrent) to avoid hitting OpenF1 rate limits.
  const sessionsWithResults: (typeof sessions[0] & {
    results: { position: number; code: string; fullName: string; team: string; teamColour?: string }[];
    isPast: boolean;
  })[] = [];

  for (const s of sessions) {
    const isPast = new Date(s.date_end) < now;
    let results: {
      position: number;
      code: string;
      fullName: string;
      team: string;
      teamColour?: string;
    }[] = [];

    if (isPast) {
      try {
        const sessionResults = await getSessionResults(s.session_key, gpId);
        results = sessionResults.map((r) => ({
          position: r.position,
          code: r.code,
          fullName: r.fullName,
          team: r.team,
          teamColour: r.teamColour,
        }));
      } catch {
        // Session not available yet or error
      }
    }

    sessionsWithResults.push({ ...s, results, isPast });
  }

  return {
    gp: {
      id: gp._id.toString(),
      season: gp.season,
      round: gp.round,
      name: gp.name,
      country: gp.country,
      circuit: gp.circuit,
      timezone: gp.timezone,
      raceDate: gp.raceDate,
      countryFlag: gp.countryFlag,
      circuitImage: gp.circuitImage,
    },
    sessions: sessionsWithResults,
    localResult,
  };
}

function formatDateTime(dateStr: string, timezone: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

export default async function GPDetailPage({
  params,
}: {
  params: Promise<{ gpId: string }>;
}) {
  const { gpId } = await params;
  const data = await getGPData(gpId);
  if (!data) notFound();

  const { gp, sessions, localResult } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/calendar"
        className="text-sm text-zinc-400 hover:text-white transition-colors"
      >
        ← Volver al calendario
      </Link>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="shrink-0 flex flex-col gap-3">
          {gp.countryFlag && (
            <img
              src={gp.countryFlag}
              alt={gp.country}
              className="w-16 h-10 object-cover rounded shadow-lg"
            />
          )}
          {gp.circuitImage && (
            <img
              src={gp.circuitImage}
              alt={gp.circuit}
              className="w-48 h-32 object-cover rounded-lg"
            />
          )}
        </div>

        <div className="flex-1">
          <p className="text-sm text-zinc-500">
            Ronda {gp.round} · Temporada {gp.season}
          </p>
          <h1 className="text-3xl font-bold text-white">{gp.name}</h1>
          <p className="text-zinc-400 mt-1">
            {gp.circuit} · {gp.country}
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            {formatDateTime(
              gp.raceDate instanceof Date
                ? gp.raceDate.toISOString()
                : String(gp.raceDate),
              gp.timezone
            )}
          </p>
        </div>
      </div>

      {localResult && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Podio oficial</h2>
          <Card className="border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
            {[
              { pos: 1, driver: localResult.p1 },
              { pos: 2, driver: localResult.p2 },
              { pos: 3, driver: localResult.p3 },
            ].map(
              ({ pos, driver }) =>
                driver && (
                  <div key={pos} className="flex items-center gap-3">
                    <span className="font-bold text-sm text-zinc-400 w-6">
                      P{pos}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: driver.teamColour ?? "#666",
                      }}
                    />
                    <span className="text-white font-medium">
                      {driver.fullName}
                    </span>
                    <span className="text-zinc-500 text-xs ml-auto">
                      {driver.team}
                    </span>
                  </div>
                )
            )}
          </Card>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Sesiones</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <Card
                key={s.session_key}
                className="px-4 py-3 border-zinc-800 bg-zinc-900/80"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{sessionIcon(s.session_name)}</span>
                  <div>
                    <p className="font-medium text-white text-sm">
                      {s.session_name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(s.date_start, gp.timezone)}
                    </p>
                  </div>
                  {s.isPast && s.results.length > 0 && (
                    <span className="ml-auto text-xs text-green-400">
                      Resultados
                    </span>
                  )}
                </div>

                {s.results.length > 0 && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-zinc-800">
                    {s.results.map((r) => (
                      <div
                        key={r.position}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-5 text-center font-mono font-bold text-zinc-400">
                          {r.position}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: r.teamColour ?? "#666",
                          }}
                        />
                        <span className="text-white font-medium truncate">
                          {r.fullName}
                        </span>
                        <span className="text-zinc-500 text-xs ml-auto">
                          {r.team}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {s.isPast && s.results.length === 0 && (
                  <p className="text-xs text-zinc-600 mt-1">Sin resultados</p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {sessions.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No hay datos de sesiones disponibles para este GP.
        </p>
      )}
    </div>
  );
}
