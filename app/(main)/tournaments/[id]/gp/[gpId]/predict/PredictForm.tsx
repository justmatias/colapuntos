"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { savePrediction } from "@/lib/actions/prediction.actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  gpId: string;
  drivers: DriverOption[];
  existing: { p1: string; p2: string; p3: string } | null;
  isOpen: boolean;
  deadlineLabel: string;
};

type State = { success: true } | { success: false; error: string } | null;

const POSITIONS = [
  { label: "P1", points: 10, borderClass: "border-yellow-500/40 bg-yellow-500/5" },
  { label: "P2", points: 7, borderClass: "border-zinc-500/40 bg-zinc-500/5" },
  { label: "P3", points: 5, borderClass: "border-orange-700/40 bg-orange-700/5" },
];

function DriverRow({ driver }: { driver: DriverOption }) {
  return (
    <div className="flex items-center gap-2">
      {driver.teamColour && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: driver.teamColour }}
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

export function PredictForm({
  tournamentId,
  gpId,
  drivers,
  existing,
  isOpen,
  deadlineLabel,
}: Props) {
  const [p1, setP1] = useState(existing?.p1 ?? "");
  const [p2, setP2] = useState(existing?.p2 ?? "");
  const [p3, setP3] = useState(existing?.p3 ?? "");
  const [saved, setSaved] = useState(false);

  const [state, action, pending] = useActionState<State, FormData>(
    savePrediction,
    null
  );

  useEffect(() => {
    if (state?.success) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const selections = [p1, p2, p3];
  const setters: ((v: string | null) => void)[] = [
    (v) => setP1(v ?? ""),
    (v) => setP2(v ?? ""),
    (v) => setP3(v ?? ""),
  ];

  if (!isOpen) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
          <span className="text-lg">🔒</span>
          <div>
            <p className="font-medium text-sm text-zinc-300">Predicciones cerradas</p>
            <p className="text-xs text-zinc-500">El plazo venció el {deadlineLabel}</p>
          </div>
        </div>

        {existing ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Tu predicción</h2>
            {[existing.p1, existing.p2, existing.p3].map((driverId, i) => {
              const driver = driverMap.get(driverId);
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-3 flex items-center gap-3 ${POSITIONS[i].borderClass}`}
                >
                  <span className="font-bold text-sm text-zinc-400 w-6">
                    {POSITIONS[i].label}
                  </span>
                  {driver ? (
                    <DriverRow driver={driver} />
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">
            No hiciste una predicción para esta carrera.
          </p>
        )}

        <Link
          href={`/tournaments/${tournamentId}/gp/${gpId}/results`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          )}
        >
          Ver resultados →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-green-700/50 bg-green-700/10 px-4 py-3">
        <span className="text-lg">🟢</span>
        <div>
          <p className="font-medium text-sm text-green-400">Predicciones abiertas</p>
          <p className="text-xs text-zinc-500">Cierra el {deadlineLabel}</p>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="gpId" value={gpId} />
        <input type="hidden" name="p1" value={p1} />
        <input type="hidden" name="p2" value={p2} />
        <input type="hidden" name="p3" value={p3} />

        {POSITIONS.map((pos, i) => (
          <div key={pos.label} className={`rounded-lg border p-4 ${pos.borderClass}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-1">
              <span className="font-bold text-sm text-zinc-300">{pos.label}</span>
              <span className="text-xs text-zinc-500">
                {pos.points} pts si acertás exacto · 3 pts si está en el podio
              </span>
            </div>
            <Select value={selections[i]} onValueChange={setters[i]}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-red-600 w-full">
                <SelectValue placeholder="Elegí un piloto">
                  {(() => {
                    const d = driverMap.get(selections[i]);
                    return d ? <DriverRow driver={d} /> : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                {drivers.map((d) => (
                  <SelectItem
                    key={d.id}
                    value={d.id}
                    disabled={selections.some((sel, j) => j !== i && sel === d.id)}
                  >
                    <DriverRow driver={d} />
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
          <p className="text-sm text-green-400">¡Predicción guardada correctamente!</p>
        )}

        <Button
          type="submit"
          disabled={pending || !p1 || !p2 || !p3}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          {pending
            ? "Guardando..."
            : existing
            ? "Actualizar predicción"
            : "Guardar predicción"}
        </Button>
      </form>
    </div>
  );
}
