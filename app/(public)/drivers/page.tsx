import Image from "next/image";
import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import { Driver } from "@/lib/models/Driver";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Card } from "@/components/ui/card";

const BASE_URL = "https://api.openf1.org/v1";

interface OpenF1SessionResult {
  position: number;
  driver_number: number;
}

async function getDriversData() {
  await connectDB();

  const currentSeason = new Date().getFullYear();

  const drivers = await Driver.find({
    season: currentSeason,
    active: true,
  })
    .sort({ lastName: 1 })
    .lean();

  const lastCompletedGP = await GrandPrix.findOne({
    season: currentSeason,
    raceDate: { $lte: new Date() },
    raceSessionKey: { $exists: true },
  })
    .sort({ raceDate: -1 })
    .lean();

  let driverPositions: Map<number, number> = new Map();

  if (lastCompletedGP?.raceSessionKey) {
    try {
      const res = await fetch(
        `${BASE_URL}/session_result?session_key=${lastCompletedGP.raceSessionKey}`
      );
      if (res.ok) {
        const results = (await res.json()) as OpenF1SessionResult[];
        for (const r of results) {
          driverPositions.set(r.driver_number, r.position);
        }
      }
    } catch {
      // Silently skip failed fetches
    }
  }

  return {
    season: currentSeason,
    lastGPName: lastCompletedGP?.name ?? null,
    drivers: drivers.map((d) => ({
      code: d.code,
      fullName: d.fullName,
      number: d.number,
      team: d.team,
      teamColour: d.teamColour ?? "#666",
      headshotUrl: d.headshotUrl ?? null,
      latestPosition: driverPositions.get(d.number) ?? null,
    })),
  };
}

export default async function DriversPage() {
  const { season, lastGPName, drivers } = await getDriversData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pilotos {season}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          {drivers.length} pilotos en la temporada
          {lastGPName && (
            <span className="text-zinc-500">
              {" "}
              · Última carrera: {lastGPName}
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {drivers.map((driver) => (
          <Link key={driver.code} href={`/drivers/${driver.code.toLowerCase()}`}>
          <Card
            className="px-4 py-3.5 border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              {driver.headshotUrl ? (
                <Image
                  src={driver.headshotUrl}
                  alt={driver.fullName}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full object-cover shrink-0 bg-zinc-800"
                />
              ) : (
                <div className="w-12 h-12 rounded-full shrink-0 bg-zinc-800 flex items-center justify-center text-zinc-600 font-bold text-lg">
                  {driver.code.slice(0, 2)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: driver.teamColour }}
                  />
                  <p
                    className="font-semibold text-white text-sm truncate"
                    style={{ color: driver.teamColour }}
                  >
                    {driver.fullName}
                  </p>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {driver.team}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-zinc-500">
                    <span className="text-zinc-600">#</span>
                    {driver.number}
                  </span>
                  <span className="text-xs text-zinc-600 uppercase font-mono">
                    {driver.code}
                  </span>
                  {driver.latestPosition !== null && (
                    <span className="text-xs ml-auto font-mono">
                      <span className="text-zinc-600">P</span>
                      <span className="text-zinc-300">{driver.latestPosition}</span>
                      <span className="text-zinc-600"> en {lastGPName}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
