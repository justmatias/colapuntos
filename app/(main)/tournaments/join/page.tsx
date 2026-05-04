"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { joinTournament } from "@/lib/actions/tournament.actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = { success: true; data: { id: string } } | { success: false; error: string } | null;

export default function JoinTournamentPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<State, FormData>(
    joinTournament,
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
        <h1 className="text-2xl font-bold">Unirme a un torneo</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Ingresá el código que te compartió el organizador.
        </p>
      </div>

      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="inviteCode" className="text-zinc-300">Código de invitación</Label>
          <Input
            id="inviteCode"
            name="inviteCode"
            required
            placeholder="Ej: AB12CD34"
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600 uppercase tracking-widest font-mono"
          />
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
            {pending ? "Uniéndome..." : "Unirme"}
          </Button>
        </div>
      </form>
    </div>
  );
}
