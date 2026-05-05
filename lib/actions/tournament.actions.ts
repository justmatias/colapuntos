"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { Types } from "mongoose";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { Prediction } from "@/lib/models/Prediction";
import { Score } from "@/lib/models/Score";
import { AuditLog } from "@/lib/models/AuditLog";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("No autenticado");
  return session;
}

const CreateSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres").max(50),
  season: z.coerce.number().int().min(2026).max(2026),
});

export async function createTournament(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse({
    name: formData.get("name"),
    season: formData.get("season"),
  });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0].message };

  try {
    const session = await getSession();
    await connectDB();

    const base = slugify(parsed.data.name, { lower: true, strict: true });
    const slug = `${base}-${nanoid(6)}`;
    const userId = new Types.ObjectId(session.user.id);

    const existing = await Tournament.findOne({ creator: userId }).lean();
    if (existing)
      return { success: false, error: "Ya creaste un torneo. Solo se puede crear uno por cuenta." };

    const tournament = await Tournament.create({
      name: parsed.data.name,
      slug,
      season: parsed.data.season,
      inviteCode: nanoid(8).toUpperCase(),
      creator: userId,
      members: [userId],
    });

    revalidatePath("/dashboard");
    return { success: true, data: { id: tournament._id.toString() } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al crear el torneo",
    };
  }
}

export async function joinTournament(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const code = ((formData.get("inviteCode") as string) ?? "").trim().toUpperCase();
  if (!code) return { success: false, error: "El código es requerido" };

  try {
    const session = await getSession();
    await connectDB();

    const tournament = await Tournament.findOne({ inviteCode: code });
    if (!tournament) return { success: false, error: "Código inválido" };

    const userId = new Types.ObjectId(session.user.id);
    const alreadyMember = tournament.members.some(
      (m: Types.ObjectId) => m.toString() === userId.toString()
    );
    if (alreadyMember)
      return { success: false, error: "Ya sos miembro de este torneo" };

    tournament.members.push(userId);
    await tournament.save();

    revalidatePath("/dashboard");
    return { success: true, data: { id: tournament._id.toString() } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al unirse al torneo",
    };
  }
}

export async function regenerateInviteCode(
  tournamentId: string
): Promise<ActionResult<{ inviteCode: string }>> {
  try {
    const session = await getSession();
    await connectDB();

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) return { success: false, error: "Torneo no encontrado" };
    if (tournament.creator.toString() !== session.user.id)
      return { success: false, error: "Solo el creador puede regenerar el código" };

    tournament.inviteCode = nanoid(8).toUpperCase();
    await tournament.save();

    await AuditLog.create({
      user: new Types.ObjectId(session.user.id),
      tournament: tournament._id,
      action: "regenerate_invite",
      details: "Código de invitación regenerado",
    });

    return { success: true, data: { inviteCode: tournament.inviteCode } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al regenerar el código",
    };
  }
}

export async function deleteTournament(
  tournamentId: string
): Promise<ActionResult> {
  try {
    const session = await getSession();
    await connectDB();

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) return { success: false, error: "Torneo no encontrado" };
    if (tournament.creator.toString() !== session.user.id)
      return { success: false, error: "Solo el creador puede eliminar el torneo" };

    const tournamentObjectId = new Types.ObjectId(tournamentId);

    await Promise.all([
      Prediction.deleteMany({ tournament: tournamentObjectId }),
      Score.deleteMany({ tournament: tournamentObjectId }),
      AuditLog.deleteMany({ tournament: tournamentObjectId }),
    ]);

    await Tournament.findByIdAndDelete(tournamentId);

    revalidatePath("/dashboard");
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al eliminar el torneo",
    };
  }
}
