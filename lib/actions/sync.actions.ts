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

  if (!gp.raceSessionKey) {
    await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
    return { success: true, updated: true, details: "GP marcado como no disponible: sin sesión de carrera en OpenF1" };
  }

  let results: OpenF1SessionResult[];
  try {
    const res = await fetch(
      `${BASE_URL}/session_result?session_key=${gp.raceSessionKey}&position<=3`
    );
    if (!res.ok) {
      await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
      return { success: true, updated: true, details: `GP marcado como no disponible: API error ${res.status}` };
    }
    results = (await res.json()) as OpenF1SessionResult[];
  } catch {
    return { success: false, error: "Error al consultar la API de OpenF1" };
  }

  if (results.length === 0) {
    await GrandPrix.findByIdAndUpdate(gpId, { cancelled: true });
    return { success: true, updated: true, details: "GP marcado como no disponible: la API no devolvió resultados" };
  }

  const byPosition = new Map<number, OpenF1SessionResult>();
  for (const r of results) {
    if (!byPosition.has(r.position)) byPosition.set(r.position, r);
  }

  function getDriverNum(pos: number): number | null {
    return byPosition.get(pos)?.driver_number ?? null;
  }

  const p1num = getDriverNum(1);
  const p2num = getDriverNum(2);
  const p3num = getDriverNum(3);

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

  const existing = await RaceResult.findOne({ grandPrix: gpId }).lean();

  if (existing) {
    const same =
      (existing.p1 as Types.ObjectId).toString() === p1Id.toString() &&
      (existing.p2 as Types.ObjectId).toString() === p2Id.toString() &&
      (existing.p3 as Types.ObjectId).toString() === p3Id.toString();

    if (same)
      return { success: true, updated: false, details: "Resultado ya sincronizado, sin cambios" };
  }

  await RaceResult.findOneAndUpdate(
    { grandPrix: new Types.ObjectId(gpId) },
    { p1: p1Id, p2: p2Id, p3: p3Id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await GrandPrix.findByIdAndUpdate(gpId, { status: "completed" });
  await recalculateScoresForGP(gpId);

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

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
