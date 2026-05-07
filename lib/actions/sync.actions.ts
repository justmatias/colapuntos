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
import { syncSessionResults } from "@/lib/session-results";
import { recalculateScoresForGP } from "@/lib/actions/scoring.actions";
import { fetchMeetingByKey, fetchWeather } from "@/lib/openf1";

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

  if (gp.cancelled)
    return { success: false, error: "GP cancelado" };

  // Verify cancellation status directly from OpenF1 before syncing
  if (gp.meetingKey) {
    try {
      const meeting = await fetchMeetingByKey(gp.meetingKey);
      if (meeting?.is_cancelled) {
        await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
        return { success: false, error: "GP cancelado según OpenF1" };
      }
    } catch {
      // best-effort check, continue
    }
  }

  if (!gp.raceSessionKey) {
    return { success: false, error: "Sin sesión de carrera en OpenF1 — se reintentará" };
  }

  // Sync session results from OpenF1 (stores in SessionResult)
  let sessionResults;
  try {
    sessionResults = await syncSessionResults(gp.raceSessionKey, gpId);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error al sincronizar resultados de sesión" };
  }

  if (sessionResults.length === 0) {
    return { success: false, error: "OpenF1 aún no tiene resultados — se reintentará" };
  }

  const top3 = sessionResults.slice(0, 3);
  const codes = top3.map((r) => r.code);

  // Resolve to MongoDB Driver ObjectIds by code
  const driverDocs = await Driver.find({
    season: gp.season,
    code: { $in: codes },
  })
    .select("code")
    .lean();

  const driverByCode = new Map(driverDocs.map((d) => [d.code, d._id as Types.ObjectId]));

  const p1Id = driverByCode.get(top3[0].code);
  const p2Id = driverByCode.get(top3[1].code);
  const p3Id = driverByCode.get(top3[2].code);

  if (!p1Id || !p2Id || !p3Id)
    return {
      success: false,
      error: `No se encontraron pilotos en la DB para los códigos: ${codes.join(", ")}`,
    };

  const existing = await RaceResult.findOne({ grandPrix: new Types.ObjectId(gpId) }).lean();

  if (existing) {
    const same =
      (existing.p1 as Types.ObjectId).toString() === p1Id.toString() &&
      (existing.p2 as Types.ObjectId).toString() === p2Id.toString() &&
      (existing.p3 as Types.ObjectId).toString() === p3Id.toString();
    if (same)
      return { success: true, updated: false, details: "Resultado ya sincronizado, sin cambios" };

    // Discrepancy detected — do NOT auto-update to protect verified results
    return {
      success: true,
      updated: false,
      details: `Discrepancia: OpenF1 dice ${codes.join(" / ")} pero el resultado guardado es diferente. Usar admin manual para corregir.`,
    };
  }

  await RaceResult.create({
    grandPrix: new Types.ObjectId(gpId),
    p1: p1Id,
    p2: p2Id,
    p3: p3Id,
  });

  await GrandPrix.findByIdAndUpdate(gpId, { status: "completed" });
  await recalculateScoresForGP(gpId);

  try {
    const weatherData = await fetchWeather(gp.raceSessionKey);
    if (weatherData.length > 0) {
      const wetCount = weatherData.filter((w) => w.rainfall > 0).length;
      const ratio = wetCount / weatherData.length;
      const weatherCondition = ratio === 0 ? "dry" : ratio > 0.5 ? "wet" : "mixed";
      await GrandPrix.findByIdAndUpdate(gpId, { weatherCondition });
    }
  } catch {
    // weather fetch is best-effort, don't block sync
  }
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
  skipped: number;
  errors: string[];
}> {
  await connectDB();

  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const recentCompletedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Sync pending GPs + recently completed GPs (in case OpenF1 corrected data)
  const [pendingGPs, recentCompletedGPs] = await Promise.all([
    GrandPrix.find({
      raceDate: { $lte: cutoff },
      status: { $ne: "completed" },
      cancelled: { $ne: true },
    })
      .select("_id raceSessionKey")
      .lean(),
    GrandPrix.find({
      raceDate: { $lte: cutoff, $gte: recentCompletedCutoff },
      status: "completed",
      cancelled: { $ne: true },
    })
      .select("_id raceSessionKey")
      .lean(),
  ]);

  const gpMap = new Map<string, typeof pendingGPs[0]>();
  for (const gp of pendingGPs) gpMap.set(gp._id.toString(), gp);
  for (const gp of recentCompletedGPs) gpMap.set(gp._id.toString(), gp);
  const gps = Array.from(gpMap.values());

  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  for (const gp of gps) {
    const result = await syncRaceResultsForGP(gp._id.toString());
    if (result.success && result.updated) {
      synced++;
    } else if (!result.success) {
      skipped++;
      errors.push(`GP ${gp._id}: ${result.error}`);
    }
  }

  return { synced, skipped, errors };
}
