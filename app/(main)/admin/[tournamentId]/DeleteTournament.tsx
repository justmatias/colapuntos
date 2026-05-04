"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTournament } from "@/lib/actions/tournament.actions";
import { Button } from "@/components/ui/button";

type Props = {
  tournamentId: string;
};

export function DeleteTournament({ tournamentId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteTournament(tournamentId);
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
        <p className="text-sm text-red-400">
          ¿Estás seguro? Se borrarán todas las predicciones, puntajes y registros del torneo. Esta acción no se puede deshacer.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-white"
        >
          {isPending ? "Eliminando..." : confirming ? "Confirmar eliminación" : "Eliminar torneo"}
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
