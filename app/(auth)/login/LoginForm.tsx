"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await signIn.email({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });

    if (result.error) {
      setError("Credenciales incorrectas");
      setPending(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email" className="text-zinc-300">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="password" className="text-zinc-300">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold" disabled={pending}>
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>

      <p className="text-center text-sm text-zinc-400">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="text-red-400 hover:text-red-300 underline underline-offset-4">
          Registrate
        </Link>
      </p>
    </form>
  );
}
