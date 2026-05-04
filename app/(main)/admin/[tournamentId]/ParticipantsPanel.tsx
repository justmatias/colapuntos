"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeParticipant } from "@/lib/actions/admin.actions";
import { regenerateInviteCode } from "@/lib/actions/tournament.actions";
import { Button } from "@/components/ui/button";

type Member = {
  id: string;
  name: string;
  isCreator: boolean;
};

type Props = {
  tournamentId: string;
  members: Member[];
  inviteCode: string;
};

export function ParticipantsPanel({ tournamentId, members, inviteCode }: Props) {
  const router = useRouter();
  const [currentCode, setCurrentCode] = useState(inviteCode);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRemove(userId: string) {
    setError("");
    startTransition(async () => {
      const result = await removeParticipant(tournamentId, userId);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRegenerate() {
    setError("");
    startTransition(async () => {
      const result = await regenerateInviteCode(tournamentId);
      if (!result.success) {
        setError(result.error);
      } else if (result.data) {
        setCurrentCode(result.data.inviteCode);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="flex-1">
          <p className="text-xs text-zinc-500 mb-0.5">Código de invitación</p>
          <p className="font-mono font-bold tracking-widest text-white">{currentCode}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={isPending}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 shrink-0"
        >
          Regenerar
        </Button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-white">{member.name}</p>
              {member.isCreator && (
                <p className="text-xs text-zinc-500">Creador</p>
              )}
            </div>
            {!member.isCreator && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(member.id)}
                disabled={isPending}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs"
              >
                Eliminar
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
