"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";

const RegisterSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type ActionResult = { success: true } | { success: false; error: string };

export async function registerUser(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    await auth.api.signUpEmail({
      body: parsed.data,
      headers: await headers(),
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al registrarse";
    return { success: false, error: message };
  }
}

export async function loginUser(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const response = await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) {
      return { success: false, error: "Credenciales incorrectas" };
    }
    const cookieStore = await cookies();
    response.headers.getSetCookie().forEach((cookie) => {
      const parts = cookie.split("; ");
      const [name, value] = parts[0].split("=");
      const attrs: Record<string, string | true> = {};
      parts.slice(1).forEach((part) => {
        const eqIdx = part.indexOf("=");
        if (eqIdx === -1) attrs[part.toLowerCase()] = true;
        else attrs[part.slice(0, eqIdx).toLowerCase()] = part.slice(eqIdx + 1);
      });
      cookieStore.set(name, value ?? "", {
        httpOnly: attrs["httponly"] === true,
        secure: attrs["secure"] === true,
        sameSite: (attrs["samesite"] as "lax" | "strict" | "none") ?? "lax",
        path: (attrs["path"] as string) ?? "/",
        maxAge: attrs["max-age"] ? Number(attrs["max-age"]) : undefined,
      });
    });
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Credenciales incorrectas";
    return { success: false, error: message };
  }
}
