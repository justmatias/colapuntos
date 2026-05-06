import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const BASE_URL = "https://api.openf1.org/v1";

interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  gmt_offset: string;
}

interface OpenF1SessionResult {
  position: number;
  driver_number: number;
}

interface OpenF1StartingGrid {
  position: number;
  driver_number: number;
  lap_duration: number;
  meeting_key: number;
  session_key: number;
}

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

  let sessions: OpenF1Session[] = [];
  if (gp.meetingKey) {
    try {
      const res = await fetch(
        `${BASE_URL}/sessions?meeting_key=${gp.meetingKey}`
      );
      if (res.ok) {
        sessions = await res.json();
        sessions.sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
        );
      }
    } catch {
      // API unavailable, show page without sessions
    }
  }

  const drivers = await Driver.find({
    season: gp.season,
    active: true,
  }).lean();

  const driverByNum = new Map(drivers.map((d) => [d.number, d]));

  const now = new Date();
  const sessionsWithResults = await Promise.all(
    sessions.map(async (s) => {
      const isPast = new Date(s.date_end) < now;
      let results: (OpenF1SessionResult & {
        code?: string;
        fullName?: string;
        team?: string;
        teamColour?: string;
        number?: number;
      })[] = [];

      if (isPast) {
        try {
          const res = await fetch(
            `${BASE_URL}/session_result?session_key=${s.session_key}&position<=3`
          );
          if (res.ok) {
            const raw = (await res.json()) as OpenF1SessionResult[];
            results = raw.map((r) => {
              const driver = driverByNum.get(r.driver_number);
              return {
                ...r,
                code: driver?.code ?? `#${r.driver_number}`,
                fullName: driver?.fullName ?? `Driver #${r.driver_number}`,
                team: driver?.team,
                teamColour: driver?.teamColour,
                number: driver?.number ?? r.driver_number,
              };
            });
          }
        } catch {
          // Silently skip failed session result fetches
        }
      }

      return { ...s, results, isPast };
    })
  );

  // Fetch starting grid for the race session
  let startingGrid: (OpenF1StartingGrid & {
    code?: string;
    fullName?: string;
    team?: string;
    teamColour?: string;
  })[] = [];
  if (gp.raceSessionKey) {
    try {
      const res = await fetch(
        `${BASE_URL}/starting_grid?session_key=${gp.raceSessionKey}`
      );
      if (res.ok) {
        const raw = (await res.json()) as OpenF1StartingGrid[];
        startingGrid = raw
          .sort((a, b) => a.position - b.position)
          .map((r) => {
            const driver = driverByNum.get(r.driver_number);
            return {
              ...r,
              code: driver?.code ?? `#${r.driver_number}`,
              fullName: driver?.fullName ?? `Driver #${r.driver_number}`,
              team: driver?.team,
              teamColour: driver?.teamColour,
            };
          });
      }
    } catch {
      // Silently skip failed starting grid fetch
    }
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
    startingGrid,
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

function formatLapDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, "0")}`;
}

export default async function GPDetailPage({
  params,
}: {
  params: Promise<{ gpId: string }>;
}) {
  const { gpId } = await params;
  const data = await getGPData(gpId);
  if (!data) notFound();

  const { gp, sessions, startingGrid } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-sm text-zinc-400 hover:text-white transition-colors"
      >
        ← Volver
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

      {startingGrid.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Parrilla de salida</h2>
          <Card className="border-zinc-800 bg-zinc-900/80 overflow-hidden">
            <div className="divide-y divide-zinc-800">
              {startingGrid.map((r) => (
                <div
                  key={r.position}
                  className="flex items-center gap-3 px-4 py-2"
                >
                  <span className="w-6 text-center font-mono font-bold text-zinc-400 text-sm">
                    {r.position}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.teamColour ?? "#666" }}
                  />
                  <span className="text-white font-medium text-sm truncate">
                    {r.fullName}
                  </span>
                  <span className="text-zinc-500 text-xs ml-auto">
                    {r.lap_duration ? formatLapDuration(r.lap_duration) : "—"}
                  </span>
                </div>
              ))}
            </div>
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
