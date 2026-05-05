"use server";

import { headers } from "next/headers";
import { Types } from "mongoose";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { RaceResult } from "@/lib/models/RaceResult";
import { Driver } from "@/lib/models/Driver";
import { User } from "@/lib/models/User";
import { Prediction } from "@/lib/models/Prediction";
import { AuditLog } from "@/lib/models/AuditLog";
import { recalculateScoresForGP } from "@/lib/actions/scoring.actions";

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("No autenticado");
  return session;
}

async function requireCreator(tournamentId: string, userId: string) {
  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) throw new Error("Torneo no encontrado");
  if (tournament.creator.toString() !== userId)
    throw new Error("Solo el creador puede realizar esta acción");
  return tournament;
}

const SaveResultSchema = z.object({
  tournamentId: z.string().min(1),
  gpId: z.string().min(1),
  p1: z.string().min(1),
  p2: z.string().min(1),
  p3: z.string().min(1),
});

export async function saveRaceResult(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = SaveResultSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    gpId: formData.get("gpId"),
    p1: formData.get("p1"),
    p2: formData.get("p2"),
    p3: formData.get("p3"),
  });
  if (!parsed.success) return { success: false, error: "Datos inválidos" };

  const { tournamentId, gpId, p1, p2, p3 } = parsed.data;

  if (p1 === p2 || p1 === p3 || p2 === p3)
    return { success: false, error: "Los tres pilotos deben ser distintos" };

  try {
    const session = await getSession();
    await connectDB();
    await requireCreator(tournamentId, session.user.id);

    const gp = await GrandPrix.findById(gpId).lean();
    if (!gp) return { success: false, error: "Gran Premio no encontrado" };

    if (new Date() < new Date(gp.raceDate))
      return { success: false, error: "Solo se pueden cargar resultados de carreras pasadas" };

    const [existing, drivers] = await Promise.all([
      RaceResult.findOne({ grandPrix: gpId }).lean(),
      Driver.find({ _id: { $in: [p1, p2, p3] } }).select("code fullName").lean(),
    ]);

    const driverMap = new Map(drivers.map((d) => [d._id.toString(), d.code]));

    const newPodium = `P1: ${driverMap.get(p1) ?? "—"}, P2: ${driverMap.get(p2) ?? "—"}, P3: ${driverMap.get(p3) ?? "—"}`;

    let details: string;
    if (existing) {
      const oldP1 = (existing.p1 as Types.ObjectId).toString();
      const oldP2 = (existing.p2 as Types.ObjectId).toString();
      const oldP3 = (existing.p3 as Types.ObjectId).toString();
      const oldDrivers = await Driver.find({
        _id: { $in: [oldP1, oldP2, oldP3] },
      })
        .select("code")
        .lean();
      const oldMap = new Map(oldDrivers.map((d) => [d._id.toString(), d.code]));
      const oldPodium = `P1: ${oldMap.get(oldP1) ?? "—"}, P2: ${oldMap.get(oldP2) ?? "—"}, P3: ${oldMap.get(oldP3) ?? "—"}`;
      details = `${gp.name}: ${oldPodium} → ${newPodium}`;
    } else {
      details = `${gp.name}: ${newPodium}`;
    }

    await RaceResult.findOneAndUpdate(
      { grandPrix: new Types.ObjectId(gpId) },
      {
        p1: new Types.ObjectId(p1),
        p2: new Types.ObjectId(p2),
        p3: new Types.ObjectId(p3),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await GrandPrix.findByIdAndUpdate(gpId, { status: "completed" });
    await recalculateScoresForGP(gpId);

    await AuditLog.create({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      grandPrix: new Types.ObjectId(gpId),
      action: "save_result",
      details,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al guardar el resultado",
    };
  }
}

const RetroactivePredictionSchema = z.object({
  tournamentId: z.string().min(1),
  gpId: z.string().min(1),
  userId: z.string().min(1),
  p1: z.string().min(1),
  p2: z.string().min(1),
  p3: z.string().min(1),
});

export async function saveRetroactivePrediction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = RetroactivePredictionSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    gpId: formData.get("gpId"),
    userId: formData.get("userId"),
    p1: formData.get("p1"),
    p2: formData.get("p2"),
    p3: formData.get("p3"),
  });
  if (!parsed.success) return { success: false, error: "Datos inválidos" };

  const { tournamentId, gpId, userId, p1, p2, p3 } = parsed.data;

  if (p1 === p2 || p1 === p3 || p2 === p3)
    return { success: false, error: "Los tres pilotos deben ser distintos" };

  try {
    const session = await getSession();
    await connectDB();
    const tournament = await requireCreator(tournamentId, session.user.id);

    const isMember = (tournament.members as Types.ObjectId[]).some(
      (m) => m.toString() === userId
    );
    if (!isMember)
      return { success: false, error: "El usuario no es miembro del torneo" };

    const gp = await GrandPrix.findById(gpId).lean();
    if (!gp) return { success: false, error: "Gran Premio no encontrado" };

    if (new Date() < new Date(gp.raceDate))
      return { success: false, error: "Solo se pueden cargar predicciones de carreras pasadas" };

    if (gp.cancelled)
      return { success: false, error: "Este Gran Premio está marcado como cancelado" };

    const [targetUser, drivers] = await Promise.all([
      User.findById(userId).select("name").lean(),
      Driver.find({ _id: { $in: [p1, p2, p3] } }).select("code").lean(),
    ]);

    const driverMap = new Map(drivers.map((d) => [d._id.toString(), d.code]));
    const podium = `P1: ${driverMap.get(p1) ?? "—"}, P2: ${driverMap.get(p2) ?? "—"}, P3: ${driverMap.get(p3) ?? "—"}`;

    await Prediction.findOneAndUpdate(
      {
        user: new Types.ObjectId(userId),
        tournament: new Types.ObjectId(tournamentId),
        grandPrix: new Types.ObjectId(gpId),
      },
      {
        p1: new Types.ObjectId(p1),
        p2: new Types.ObjectId(p2),
        p3: new Types.ObjectId(p3),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await AuditLog.create({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      grandPrix: new Types.ObjectId(gpId),
      action: "save_retroactive_prediction",
      details: `Predicción retroactiva para ${targetUser?.name ?? userId} — ${gp.name}: ${podium}`,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al guardar la predicción",
    };
  }
}

export async function toggleGPCancelled(
  gpId: string,
  tournamentId: string,
  cancelled: boolean
): Promise<ActionResult> {
  try {
    const session = await getSession();
    await connectDB();
    await requireCreator(tournamentId, session.user.id);

    const gp = await GrandPrix.findByIdAndUpdate(
      gpId,
      { cancelled },
      { new: true }
    ).lean();
    if (!gp) return { success: false, error: "Gran Premio no encontrado" };

    await AuditLog.create({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      grandPrix: new Types.ObjectId(gpId),
      action: cancelled ? "gp_cancelled" : "gp_uncancelled",
      details: `${gp.name} marcado como ${cancelled ? "no disponible" : "activo"}`,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al cambiar el estado del GP",
    };
  }
}

export async function removeParticipant(
  tournamentId: string,
  userId: string
): Promise<ActionResult> {
  try {
    const session = await getSession();
    await connectDB();

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) return { success: false, error: "Torneo no encontrado" };
    if (tournament.creator.toString() !== session.user.id)
      return { success: false, error: "Solo el creador puede eliminar participantes" };
    if (tournament.creator.toString() === userId)
      return { success: false, error: "No podés eliminar al creador del torneo" };

    const removedUser = await User.findById(userId).select("name").lean();
    const removedName = removedUser?.name ?? userId;

    tournament.members = (tournament.members as Types.ObjectId[]).filter(
      (m) => m.toString() !== userId
    );
    await tournament.save();

    await AuditLog.create({
      user: new Types.ObjectId(session.user.id),
      tournament: new Types.ObjectId(tournamentId),
      action: "remove_participant",
      details: `Eliminado participante "${removedName}"`,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al eliminar el participante",
    };
  }
}
