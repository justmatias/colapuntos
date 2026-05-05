"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { createTournament } from "@/lib/actions/tournament.actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type State = { success: true; data: { id: string } } | { success: false; error: string } | null;

export default function NewTournamentPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<State, FormData>(
    createTournament,
    null
  );

  useEffect(() => {
    if (state?.success) {
      router.push(`/tournaments/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Crear torneo</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Invitá a tus amigos con el código que se genera automáticamente.
        </p>
      </div>

      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-zinc-300">Nombre del torneo</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Ej: F1 con los pibes"
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="season" className="text-zinc-300">Temporada</Label>
          <Select name="season" defaultValue="2026">
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-red-600 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {state && !state.success && (
          <p className="text-sm text-red-400">{state.error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
          >
            Cancelar
          </Link>
          <Button
            type="submit"
            disabled={pending}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {pending ? "Creando..." : "Crear torneo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
