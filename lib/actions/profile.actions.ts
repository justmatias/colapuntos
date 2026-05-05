"use server";

import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/lib/models/User";
import { Driver } from "@/lib/models/Driver";

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export async function updateProfileName(
  name: string
): Promise<ActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { success: false, error: "No autenticado" };

    if (!name || name.trim().length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres" };
    }

    await connectDB();
    const result = await User.findByIdAndUpdate(
      new Types.ObjectId(session.user.id),
      { name: name.trim() },
      { new: true }
    );

    if (!result) {
      return { success: false, error: "Usuario no encontrado" };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al actualizar",
    };
  }
}

export async function updateFavoriteDriver(
  driverCode: string,
  season: number
): Promise<ActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { success: false, error: "No autenticado" };

    await connectDB();

    const driver = await Driver.findOne({
      code: driverCode.toUpperCase(),
      season,
    }).lean();
    if (!driver) return { success: false, error: "Piloto no encontrado" };

    const updated = await User.findByIdAndUpdate(
      new Types.ObjectId(session.user.id),
      {
        favoriteDriverCode: driver.code,
        favoriteDriverHeadshot: driver.headshotUrl ?? undefined,
      },
      { new: true }
    );

    if (!updated) {
      return { success: false, error: "Usuario no encontrado" };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al actualizar",
    };
  }
}
