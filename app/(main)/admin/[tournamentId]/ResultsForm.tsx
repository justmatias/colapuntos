"use client";

import { useState, useEffect, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveRaceResult, toggleGPCancelled } from "@/lib/actions/admin.actions";
import { syncRaceResultsForGP } from "@/lib/actions/sync.actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GPOption = {
  id: string;
  round: number;
  name: string;
  hasResult: boolean;
  cancelled: boolean;
  existingResult?: {
    p1: string;
    p2: string;
    p3: string;
    updatedAt: string | null;
  };
};

type DriverOption = {
  id: string;
  code: string;
  fullName: string;
  team: string;
  teamColour?: string;
  number: number;
};

type Props = {
  tournamentId: string;
  gps: GPOption[];
  drivers: DriverOption[];
};

type State = { success: true } | { success: false; error: string } | null;

const POSITIONS = [
  { label: "P1", borderClass: "border-yellow-500/40 bg-yellow-500/5" },
  { label: "P2", borderClass: "border-zinc-500/40 bg-zinc-500/5" },
  { label: "P3", borderClass: "border-orange-700/40 bg-orange-700/5" },
];

function DriverItem({ driver }: { driver: DriverOption }) {
  return (
    <div className="flex items-center gap-2">
      {driver.teamColour && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: `#${driver.teamColour}` }}
        />
      )}
      <span className="font-mono text-xs text-zinc-500 w-5 text-right">
        {driver.number}
      </span>
      <span>{driver.fullName}</span>
      <span className="text-zinc-500 text-xs truncate">{driver.team}</span>
    </div>
  );
}

export function ResultsForm({ tournamentId, gps, drivers }: Props) {
  const router = useRouter();
  const [selectedGP, setSelectedGP] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");
  const [saved, setSaved] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, startSyncing] = useTransition();

  const [state, action, pending] = useActionState<State, FormData>(
    saveRaceResult,
    null
  );

  useEffect(() => {
    if (state?.success) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    if (!selectedGP) return;
    const gp = gps.find((g) => g.id === selectedGP);
    if (gp?.existingResult) {
      setP1(gp.existingResult.p1);
      setP2(gp.existingResult.p2);
      setP3(gp.existingResult.p3);
    } else {
      setP1("");
      setP2("");
      setP3("");
    }
  }, [selectedGP, gps]);

  function handleToggleCancelled() {
    if (!selectedGP) return;
    const gp = gps.find((g) => g.id === selectedGP);
    if (!gp) return;
    startSyncing(async () => {
      const result = await toggleGPCancelled(selectedGP, tournamentId, !gp.cancelled);
      if (result.success) {
        router.refresh();
      } else {
        setSyncMsg(result.error);
      }
    });
  }

  function handleSync() {
    if (!selectedGP) return;
    setSyncMsg("");
    startSyncing(async () => {
      const result = await syncRaceResultsForGP(selectedGP, tournamentId);
      if (result.success) {
        setSyncMsg(result.details);
        router.refresh();
        setTimeout(() => setSyncMsg(""), 5000);
      } else {
        setSyncMsg(result.error);
      }
    });
  }

  const currentGP = gps.find((g) => g.id === selectedGP);

  const selections = [p1, p2, p3];
  const setters: ((v: string | null) => void)[] = [
    (v) => setP1(v ?? ""),
    (v) => setP2(v ?? ""),
    (v) => setP3(v ?? ""),
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block">Gran Premio</label>
        <Select value={selectedGP} onValueChange={(v) => setSelectedGP(v ?? "")}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-red-600 w-full">
            <SelectValue placeholder="Seleccioná un Gran Premio">
              {(v: string) => {
                const gp = gps.find((g) => g.id === v);
                return gp ? `R${gp.round} — ${gp.name}` : null;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
            {gps.map((gp) => (
              <SelectItem key={gp.id} value={gp.id}>
                <span className="font-mono text-xs text-zinc-500 mr-2">R{gp.round}</span>
                <span className={gp.cancelled ? "text-zinc-500 line-through" : ""}>{gp.name}</span>
                {gp.cancelled && (
                  <span className="ml-2 text-xs text-red-400">⛔ no disponible</span>
                )}
                {!gp.cancelled && gp.hasResult && (
                  <span className="ml-2 text-xs text-green-400">✓ cargado</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedGP && currentGP?.cancelled && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 space-y-3">
          <p className="text-sm text-red-400">⛔ Este GP está marcado como no disponible. No se pueden cargar resultados ni predicciones para él.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleCancelled}
            disabled={syncing}
            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white text-xs"
          >
            {syncing ? "Actualizando..." : "Reactivar GP"}
          </Button>
          {syncMsg && <p className="text-xs text-red-400">{syncMsg}</p>}
        </div>
      )}

      {selectedGP && !currentGP?.cancelled && (
        <>
          {currentGP?.existingResult?.updatedAt && (
            <p className="text-xs text-zinc-500">
              Última actualización:{" "}
              {new Date(currentGP.existingResult.updatedAt).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white text-xs w-full"
          >
            {syncing ? "Sincronizando..." : "Sincronizar desde API"}
          </Button>

          {syncMsg && (
            <p
              className={`text-xs ${
                syncMsg.startsWith("Resultado ya") || syncMsg.includes("sync automático")
                  ? "text-zinc-500"
                  : syncMsg.startsWith("P1:")
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {syncMsg}
            </p>
          )}

          <form action={action} className="space-y-3">
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="gpId" value={selectedGP} />
          <input type="hidden" name="p1" value={p1} />
          <input type="hidden" name="p2" value={p2} />
          <input type="hidden" name="p3" value={p3} />

          {POSITIONS.map((pos, i) => (
            <div key={pos.label} className={`rounded-lg border p-3 ${pos.borderClass}`}>
              <label className="text-xs font-bold text-zinc-400 block mb-2">
                {pos.label}
              </label>
              <Select value={selections[i]} onValueChange={setters[i]}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-red-600 w-full">
                  <SelectValue placeholder="Seleccioná piloto">
                    {(v: string) => {
                      const d = drivers.find((dr) => dr.id === v);
                      return d ? `${d.number} — ${d.fullName}` : null;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                  {drivers.map((d) => (
                    <SelectItem
                      key={d.id}
                      value={d.id}
                      disabled={selections.some((sel, j) => j !== i && sel === d.id)}
                    >
                      <DriverItem driver={d} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {state && !state.success && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          {saved && (
            <p className="text-sm text-green-400">¡Resultado guardado y puntos recalculados!</p>
          )}

          <Button
            type="submit"
            disabled={pending || !p1 || !p2 || !p3}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {pending ? "Guardando..." : "Guardar resultado"}
          </Button>
        </form>

          {!currentGP?.hasResult && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleCancelled}
              disabled={syncing}
              className="border-red-900/50 text-red-400/70 hover:bg-red-950/30 hover:text-red-400 text-xs w-full"
            >
              {syncing ? "Actualizando..." : "Marcar como no disponible"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
