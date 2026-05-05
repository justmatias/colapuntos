"use server";

import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { RaceResult } from "@/lib/models/RaceResult";
import { Driver } from "@/lib/models/Driver";
import { AuditLog } from "@/lib/models/AuditLog";
import { Tournament } from "@/lib/models/Tournament";
import { recalculateScoresForGP } from "@/lib/actions/scoring.actions";

const BASE_URL = "https://api.openf1.org/v1";

interface OpenF1SessionResult {
  position: number;
  driver_number: number;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
}

type SyncResult =
  | { success: true; updated: boolean; details: string }
  | { success: false; error: string };

export async function syncRaceResultsForGP(gpId: string, tournamentId?: string): Promise<SyncResult> {
  if (tournamentId !== undefined) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { success: false, error: "No autenticado" };
    await connectDB();
    const tournament = await Tournament.findById(tournamentId).lean();
    if (!tournament || tournament.creator.toString() !== session.user.id)
      return { success: false, error: "Solo el creador puede sincronizar resultados" };
  }

  await connectDB();

  const gp = await GrandPrix.findById(gpId).lean();
  if (!gp) return { success: false, error: "Gran Premio no encontrado" };

  if (new Date() < new Date(gp.raceDate))
    return { success: false, error: "La carrera aún no se ha disputado" };

  if (gp.status === "completed")
    return { success: true, updated: false, details: "GP ya procesado" };

  if (!gp.raceSessionKey) {
    await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
    return { success: true, updated: true, details: "GP marcado como no disponible: sin sesión de carrera en OpenF1" };
  }

  let results: OpenF1SessionResult[];
  try {
    const res = await fetch(
      `${BASE_URL}/session_result?session_key=${gp.raceSessionKey}`
    );
    if (!res.ok) {
      // Transient API error — do not cancel; caller can retry
      return { success: false, error: `OpenF1 API error ${res.status} — intente de nuevo más tarde` };
    }
    results = (await res.json()) as OpenF1SessionResult[];
  } catch {
    return { success: false, error: "Error al consultar la API de OpenF1" };
  }

  if (results.length === 0) {
    await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
    return { success: true, updated: true, details: "GP marcado como no disponible: la API no devolvió resultados" };
  }

  // Build classified podium: sorted by position, excluding disqualified/DNS drivers
  const classified = results
    .filter((r) => !r.dsq && !r.dns)
    .sort((a, b) => a.position - b.position);

  const p1num = classified[0]?.driver_number ?? null;
  const p2num = classified[1]?.driver_number ?? null;
  const p3num = classified[2]?.driver_number ?? null;

  if (!p1num || !p2num || !p3num)
    return { success: false, error: "Faltan posiciones del podio en la respuesta de la API" };

  const driverDocs = await Driver.find({
    season: gp.season,
    number: { $in: [p1num, p2num, p3num] },
  })
    .select("code fullName number")
    .lean();

  const driverByNum = new Map(driverDocs.map((d) => [d.number, d]));

  function resolveDriverId(num: number): Types.ObjectId | null {
    const d = driverByNum.get(num);
    return d ? (d._id as Types.ObjectId) : null;
  }

  const p1Id = resolveDriverId(p1num);
  const p2Id = resolveDriverId(p2num);
  const p3Id = resolveDriverId(p3num);

  if (!p1Id || !p2Id || !p3Id)
    return {
      success: false,
      error: `No se encontraron pilotos en la DB para los números: ${[p1num, p2num, p3num].join(
        ", "
      )}`,
    };

  const before = await RaceResult.findOneAndUpdate(
    { grandPrix: new Types.ObjectId(gpId) },
    { p1: p1Id, p2: p2Id, p3: p3Id },
    { upsert: true, new: false, setDefaultsOnInsert: true }
  );

  if (before) {
    const same =
      (before.p1 as Types.ObjectId).toString() === p1Id.toString() &&
      (before.p2 as Types.ObjectId).toString() === p2Id.toString() &&
      (before.p3 as Types.ObjectId).toString() === p3Id.toString();
    if (same)
      return { success: true, updated: false, details: "Resultado ya sincronizado, sin cambios" };
  }

  await GrandPrix.findByIdAndUpdate(gpId, { status: "completed" });
  await recalculateScoresForGP(gpId);

  try {
    const weatherRes = await fetch(`${BASE_URL}/weather?session_key=${gp.raceSessionKey}`);
    if (weatherRes.ok) {
      const weatherData = (await weatherRes.json()) as { rainfall: number }[];
      if (weatherData.length > 0) {
        const wetCount = weatherData.filter((w) => w.rainfall > 0).length;
        const ratio = wetCount / weatherData.length;
        const weatherCondition = ratio === 0 ? "dry" : ratio > 0.5 ? "wet" : "mixed";
        await GrandPrix.findByIdAndUpdate(gpId, { weatherCondition });
      }
    }
  } catch {
    // weather fetch is best-effort, don't block sync
  }

  const codes = [p1num, p2num, p3num].map(
    (n) => driverByNum.get(n)?.code ?? `#${n}`
  );
  const details = `${gp.name}: P1 ${codes[0]}, P2 ${codes[1]}, P3 ${codes[2]} (sync automático)`;

  await AuditLog.create({
    user: new Types.ObjectId("000000000000000000000000"),
    tournament: new Types.ObjectId("000000000000000000000000"),
    grandPrix: new Types.ObjectId(gpId),
    action: "sync_result",
    details,
  });

  return { success: true, updated: true, details };
}

export async function syncAllPendingResults(): Promise<{
  synced: number;
  cancelled: number;
  errors: string[];
}> {
  await connectDB();

  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const gps = await GrandPrix.find({
    raceDate: { $lte: cutoff },
    status: { $ne: "completed" },
    cancelled: { $ne: true },
  })
    .select("_id raceSessionKey")
    .lean();

  const errors: string[] = [];
  let synced = 0;
  let cancelled = 0;

  for (const gp of gps) {
    const result = await syncRaceResultsForGP(gp._id.toString());
    if (result.success && result.updated) {
      if (result.details.includes("no disponible")) cancelled++;
      else synced++;
    }
    if (!result.success) errors.push(`GP ${gp._id}: ${result.error}`);
  }

  return { synced, cancelled, errors };
}
