"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveTournament } from "@/lib/actions/tournament.actions";
import { Button } from "@/components/ui/button";

export function LeaveTournament({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleLeave() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await leaveTournament(tournamentId);
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.push("/dashboard");
      }
    });
  }

  return (
    <div className="space-y-2">
      {confirming && (
        <p className="text-sm text-zinc-400">
          ¿Seguro? Necesitarás el código de invitación para volver a unirte.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLeave}
          disabled={isPending}
          className={confirming ? "border-red-700 text-red-400 hover:bg-red-900/20 hover:text-red-300" : "border-zinc-700 text-zinc-400 hover:text-white"}
        >
          {isPending ? "Abandonando..." : confirming ? "Confirmar" : "Abandonar torneo"}
        </Button>
        {confirming && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="border-zinc-700 text-zinc-300"
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
