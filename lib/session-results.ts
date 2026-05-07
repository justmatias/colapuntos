import { connectDB } from "@/lib/db/mongoose";
import { SessionResult } from "@/lib/models/SessionResult";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { RaceResult } from "@/lib/models/RaceResult";
import { Types } from "mongoose";
import {
  fetchSessionResults,
  fetchDriverForSession,
  fetchSessionByKey,
  fetchSessionsForMeeting,
} from "@/lib/openf1";

export interface SessionResultType {
  position: number;
  driverNumber: number;
  code: string;
  fullName: string;
  team: string;
  teamColour?: string;
}

/**
 * Sincroniza los resultados de una sesión específica desde OpenF1.
 * Usa upsert para evitar conflictos en cargas concurrentes.
 */
export async function syncSessionResults(
  sessionKey: number,
  grandPrixId: string
): Promise<SessionResultType[]> {
  await connectDB();

  const raw = await fetchSessionResults(sessionKey);

  const classified = raw
    .filter((r) => typeof r.position === "number" && r.position <= 3)
    .sort((a, b) => a.position - b.position);

  if (classified.length === 0) {
    return [];
  }

  const enriched = await Promise.all(
    classified.map(async (r) => {
      const d = await fetchDriverForSession(r.driver_number, sessionKey);
      if (d?.name_acronym) {
        return {
          position: r.position,
          driverNumber: r.driver_number,
          code: d.name_acronym.toUpperCase(),
          fullName: d.full_name ?? `Driver #${r.driver_number}`,
          team: d.team_name ?? "Unknown",
          teamColour: d.team_colour ? `#${d.team_colour}` : undefined,
        };
      }
      return {
        position: r.position,
        driverNumber: r.driver_number,
        code: `#${r.driver_number}`,
        fullName: `Driver #${r.driver_number}`,
        team: "Unknown",
        teamColour: undefined,
      };
    })
  );

  const session = await fetchSessionByKey(sessionKey);
  const sessionName = session?.session_name ?? "Unknown";
  const sessionType = session?.session_type ?? "Unknown";

  await SessionResult.findOneAndReplace(
    { sessionKey },
    {
      grandPrix: new Types.ObjectId(grandPrixId),
      sessionKey,
      sessionName,
      sessionType,
      results: enriched,
      fetchedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return enriched;
}

/**
 * Obtiene resultados de una sesión. Lee de DB si existe, si no, sincroniza desde OpenF1.
 */
export async function getSessionResults(
  sessionKey: number,
  grandPrixId: string
): Promise<SessionResultType[]> {
  await connectDB();

  const existing = await SessionResult.findOne({ sessionKey }).lean();
  if (existing) {
    return existing.results.map(
      (r: {
        position: number;
        driverNumber: number;
        code: string;
        fullName: string;
        team: string;
        teamColour?: string;
      }) => ({
        position: r.position,
        driverNumber: r.driverNumber,
        code: r.code,
        fullName: r.fullName,
        team: r.team,
        teamColour: r.teamColour,
      })
    );
  }

  return syncSessionResults(sessionKey, grandPrixId);
}

/**
 * Sincroniza todas las sesiones de un GP.
 */
export async function syncGPResults(gpId: string): Promise<{
  sessions: { sessionKey: number; sessionName: string; results: SessionResultType[] }[];
  raceResult?: SessionResultType[];
}> {
  await connectDB();

  const gp = await GrandPrix.findById(gpId).lean();
  if (!gp || !gp.meetingKey) {
    return { sessions: [] };
  }

  const sessions = await fetchSessionsForMeeting(gp.meetingKey);
  const now = new Date();

  const results: { sessionKey: number; sessionName: string; results: SessionResultType[] }[] = [];
  let raceResult: SessionResultType[] | undefined;

  for (const s of sessions) {
    const isPast = new Date(s.date_end) < now;
    if (!isPast) continue;

    try {
      const sessionResults = await getSessionResults(s.session_key, gpId);
      if (sessionResults.length > 0) {
        results.push({
          sessionKey: s.session_key,
          sessionName: s.session_name,
          results: sessionResults,
        });

        if (s.session_name === "Race") {
          raceResult = sessionResults;
        }
      }
    } catch {
      // Skip failed sessions
    }
  }

  if (raceResult && raceResult.length >= 3) {
    const existingRaceResult = await RaceResult.findOne({ grandPrix: gp._id }).lean();
    if (!existingRaceResult) {
      const codes = raceResult.slice(0, 3).map((r) => r.code);
      const drivers = await Driver.find({
        season: gp.season,
        code: { $in: codes },
      }).lean();

      const driverByCode = new Map(drivers.map((d) => [d.code, d._id]));
      const p1 = driverByCode.get(raceResult[0].code);
      const p2 = driverByCode.get(raceResult[1].code);
      const p3 = driverByCode.get(raceResult[2].code);

      if (p1 && p2 && p3) {
        await RaceResult.create({ grandPrix: gp._id, p1, p2, p3 });
        await GrandPrix.findByIdAndUpdate(gpId, { status: "completed" });
      }
    }
  }

  return { sessions: results, raceResult };
}
