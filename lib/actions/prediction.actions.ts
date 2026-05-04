"use server";

import { headers } from "next/headers";
import { Types } from "mongoose";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Prediction } from "@/lib/models/Prediction";

type ActionResult =
  | { success: true }
  | { success: false; error: string };

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("No autenticado");
  return session;
}

const SaveSchema = z.object({
  tournamentId: z.string().min(1),
  gpId: z.string().min(1),
  p1: z.string().min(1),
  p2: z.string().min(1),
  p3: z.string().min(1),
});

export async function savePrediction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = SaveSchema.safeParse({
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

    const tournament = await Tournament.findById(tournamentId).lean();
    if (!tournament) return { success: false, error: "Torneo no encontrado" };

    const isMember = (tournament.members as Types.ObjectId[]).some(
      (m) => m.toString() === session.user.id
    );
    if (!isMember) return { success: false, error: "No sos miembro de este torneo" };

    const gp = await GrandPrix.findById(gpId).lean();
    if (!gp) return { success: false, error: "Gran Premio no encontrado" };

    if (new Date() > new Date(gp.predictionDeadline))
      return { success: false, error: "El plazo de predicciones ya cerró" };

    await Prediction.findOneAndUpdate(
      {
        user: new Types.ObjectId(session.user.id),
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

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al guardar la predicción",
    };
  }
}
