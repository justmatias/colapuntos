import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import { Driver } from "@/lib/models/Driver";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Card } from "@/components/ui/card";

const BASE_URL = "https://api.openf1.org/v1";

interface OpenF1SessionResult {
  position: number;
  driver_number: number;
  gap_to_leader?: number;
  interval?: number;
  points?: number;
}

interface OpenF1Championship {
  driver_number: number;
  position: number;
  points: number;
  points_after_race?: number;
  position_after_race?: number;
}

interface OpenF1Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
}

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "bg-red-600 text-white",
  MEDIUM: "bg-yellow-400 text-black",
  HARD: "bg-zinc-200 text-black",
  INTERMEDIATE: "bg-green-500 text-white",
  WET: "bg-blue-500 text-white",
  UNKNOWN: "bg-zinc-700 text-zinc-300",
  TEST_UNKNOWN: "bg-zinc-700 text-zinc-300",
};

function compoundClass(compound: string): string {
  return COMPOUND_COLORS[compound?.toUpperCase()] ?? "bg-zinc-700 text-zinc-300";
}

async function getDriverDetail(code: string) {
  await connectDB();

  const currentSeason = new Date().getFullYear();
  const upperCode = code.toUpperCase();

  const driver = await Driver.findOne({ code: upperCode, season: currentSeason }).lean();
  if (!driver) return null;

  const completedGPs = await GrandPrix.find({
    season: currentSeason,
    raceDate: { $lte: new Date() },
    raceSessionKey: { $exists: true, $ne: null },
    cancelled: { $ne: true },
  })
    .sort({ raceDate: 1 })
    .lean();

  const lastGP = completedGPs[completedGPs.length - 1];

  // Championship standing from last completed race
  let championship: { position: number; points: number } | null = null;
  if (lastGP?.raceSessionKey) {
    try {
      const res = await fetch(
        `${BASE_URL}/drivers_championship?session_key=${lastGP.raceSessionKey}&driver_number=${driver.number}`
      );
      if (res.ok) {
        const data = (await res.json()) as OpenF1Championship[];
        if (data[0]) {
          championship = {
            position: data[0].position,
            points: data[0].points,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // Results and stints per race
  const raceResults = await Promise.all(
    completedGPs.map(async (gp) => {
      let position: number | null = null;
      let stints: OpenF1Stint[] = [];

      await Promise.all([
        fetch(`${BASE_URL}/session_result?session_key=${gp.raceSessionKey}&driver_number=${driver.number}`)
          .then((r) => r.ok ? r.json() : [])
          .then((data: OpenF1SessionResult[]) => {
            if (data[0]) position = data[0].position;
          })
          .catch(() => {}),

        fetch(`${BASE_URL}/stints?session_key=${gp.raceSessionKey}&driver_number=${driver.number}`)
          .then((r) => r.ok ? r.json() : [])
          .then((data: OpenF1Stint[]) => {
            stints = data.sort((a, b) => a.stint_number - b.stint_number);
          })
          .catch(() => {}),
      ]);

      return {
        gpId: gp._id.toString(),
        name: gp.name,
        country: gp.country,
        countryFlag: gp.countryFlag ?? null,
        round: gp.round,
        position,
        stints,
      };
    })
  );

  return {
    driver: {
      code: driver.code,
      fullName: driver.fullName,
      firstName: driver.firstName,
      lastName: driver.lastName,
      number: driver.number,
      team: driver.team,
      teamColour: driver.teamColour ?? "#666",
      headshotUrl: driver.headshotUrl ?? null,
    },
    championship,
    raceResults,
  };
}

function positionBadge(pos: number | null) {
  if (pos === null) return <span className="text-zinc-600 font-mono text-sm">—</span>;
  const color =
    pos === 1 ? "text-yellow-400" : pos === 2 ? "text-zinc-300" : pos === 3 ? "text-amber-600" : "text-zinc-400";
  return <span className={`font-mono font-bold text-sm ${color}`}>P{pos}</span>;
}

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getDriverDetail(code);
  if (!data) notFound();

  const { driver, championship, raceResults } = data;
  const racesWithData = raceResults.filter((r) => r.position !== null);

  return (
    <div className="space-y-8">
      <Link href="/drivers" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-2 group">
        <span className="text-base leading-none group-hover:-translate-x-0.5 transition-transform">←</span>
        Pilotos
      </Link>

      {/* Header */}
      <div className="flex items-center gap-5">
        {driver.headshotUrl ? (
          <Image
            src={driver.headshotUrl}
            alt={driver.fullName}
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover bg-zinc-800 shrink-0"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full shrink-0 flex items-center justify-center text-2xl font-black"
            style={{ backgroundColor: driver.teamColour + "33" }}
          >
            {driver.code.slice(0, 2)}
          </div>
        )}
        <div>
          <p className="text-sm text-zinc-500 font-mono">{driver.code} · #{driver.number}</p>
          <h1 className="text-2xl font-bold" style={{ color: driver.teamColour }}>
            {driver.fullName}
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">{driver.team}</p>
        </div>
      </div>

      {/* Championship */}
      {championship && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="px-4 py-3 border-zinc-800 bg-zinc-900/80 text-center">
            <p className="text-xs text-zinc-500 mb-1">Posición WDC</p>
            <p className="text-2xl font-bold text-white">P{championship.position}</p>
          </Card>
          <Card className="px-4 py-3 border-zinc-800 bg-zinc-900/80 text-center">
            <p className="text-xs text-zinc-500 mb-1">Puntos</p>
            <p className="text-2xl font-bold text-white">{championship.points}</p>
          </Card>
          <Card className="px-4 py-3 border-zinc-800 bg-zinc-900/80 text-center">
            <p className="text-xs text-zinc-500 mb-1">Carreras</p>
            <p className="text-2xl font-bold text-white">{racesWithData.length}</p>
          </Card>
          <Card className="px-4 py-3 border-zinc-800 bg-zinc-900/80 text-center">
            <p className="text-xs text-zinc-500 mb-1">Podios</p>
            <p className="text-2xl font-bold text-white">
              {racesWithData.filter((r) => r.position !== null && r.position <= 3).length}
            </p>
          </Card>
        </div>
      )}

      {/* Race-by-race results */}
      {raceResults.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Resultados por carrera</h2>
          <div className="space-y-2">
            {raceResults.map((race) => (
              <Card
                key={race.gpId}
                className="px-4 py-3 border-zinc-800 bg-zinc-900/80"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 font-mono w-6 shrink-0">
                    R{race.round}
                  </span>
                  {race.countryFlag && (
                    <img
                      src={race.countryFlag}
                      alt={race.country}
                      className="w-7 h-4.5 object-cover rounded shrink-0"
                    />
                  )}
                  <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate">
                    {race.name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {race.stints.map((s) => (
                      <span
                        key={s.stint_number}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${compoundClass(s.compound)}`}
                        title={`Stint ${s.stint_number}: ${s.compound}, vueltas ${s.lap_start}–${s.lap_end}`}
                      >
                        {s.compound?.slice(0, 1) ?? "?"}
                      </span>
                    ))}
                  </div>
                  <div className="w-10 text-right shrink-0">
                    {positionBadge(race.position)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {raceResults.length === 0 && (
        <p className="text-zinc-500 text-sm">No hay carreras completadas aún en esta temporada.</p>
      )}
    </div>
  );
}
