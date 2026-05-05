"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveRetroactivePrediction } from "@/lib/actions/admin.actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Member = {
  id: string;
  name: string;
};

type GPOption = {
  id: string;
  round: number;
  name: string;
  cancelled: boolean;
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
  members: Member[];
  gps: GPOption[];
  drivers: DriverOption[];
  predictions: Record<string, { p1: string; p2: string; p3: string }>;
};

type State = { success: true } | { success: false; error: string } | null;

const POSITIONS = [
  { key: "p1" as const, label: "P1", borderClass: "border-yellow-500/40 bg-yellow-500/5" },
  { key: "p2" as const, label: "P2", borderClass: "border-zinc-500/40 bg-zinc-500/5" },
  { key: "p3" as const, label: "P3", borderClass: "border-orange-700/40 bg-orange-700/5" },
];

function DriverItem({ driver }: { driver: DriverOption }) {
  return (
    <div className="flex items-center gap-2">
      {driver.teamColour && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: driver.teamColour }}
        />
      )}
      <span className="font-mono text-xs text-zinc-500 w-5 text-right">{driver.number}</span>
      <span>{driver.fullName}</span>
      <span className="text-zinc-500 text-xs truncate">{driver.team}</span>
    </div>
  );
}

export function RetroactivePredictionsPanel({
  tournamentId,
  members,
  gps,
  drivers,
  predictions,
}: Props) {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedGP, setSelectedGP] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");
  const [saved, setSaved] = useState(false);

  const [state, action, pending] = useActionState<State, FormData>(
    saveRetroactivePrediction,
    null
  );

  useEffect(() => {
    if (state?.success) {
      setSaved(true);
      router.refresh();
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  useEffect(() => {
    if (!selectedUser || !selectedGP) return;
    const key = `${selectedUser}_${selectedGP}`;
    const existing = predictions[key];
    if (existing) {
      setP1(existing.p1);
      setP2(existing.p2);
      setP3(existing.p3);
    } else {
      setP1("");
      setP2("");
      setP3("");
    }
  }, [selectedUser, selectedGP, predictions]);

  const currentGP = gps.find((g) => g.id === selectedGP);
  const selections = [p1, p2, p3];
  const setters = [
    (v: string | null) => setP1(v ?? ""),
    (v: string | null) => setP2(v ?? ""),
    (v: string | null) => setP3(v ?? ""),
  ];

  const predKey = selectedUser && selectedGP ? `${selectedUser}_${selectedGP}` : null;
  const hasExisting = predKey ? !!predictions[predKey] : false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-zinc-400 mb-1.5 block">Participante</label>
          <Select value={selectedUser} onValueChange={(v) => setSelectedUser(v ?? "")}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-red-600 w-full">
              <SelectValue placeholder="Seleccioná un participante">
                {(v: string) => members.find((m) => m.id === v)?.name ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1.5 block">Gran Premio</label>
          <Select
            value={selectedGP}
            onValueChange={(v) => setSelectedGP(v ?? "")}
          >
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
                <SelectItem key={gp.id} value={gp.id} disabled={gp.cancelled}>
                  <span className="font-mono text-xs text-zinc-500 mr-2">R{gp.round}</span>
                  <span className={gp.cancelled ? "text-zinc-500 line-through" : ""}>{gp.name}</span>
                  {gp.cancelled && (
                    <span className="ml-2 text-xs text-red-400">⛔ no disponible</span>
                  )}
                  {!gp.cancelled && predKey && predictions[`${selectedUser}_${gp.id}`] && (
                    <span className="ml-2 text-xs text-blue-400">✎ ya cargado</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedUser && selectedGP && !currentGP?.cancelled && (
        <>
          {hasExisting && (
            <p className="text-xs text-blue-400">
              Este participante ya tiene predicción para este GP. Podés sobreescribirla.
            </p>
          )}

          <form action={action} className="space-y-3">
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="gpId" value={selectedGP} />
            <input type="hidden" name="userId" value={selectedUser} />
            <input type="hidden" name="p1" value={p1} />
            <input type="hidden" name="p2" value={p2} />
            <input type="hidden" name="p3" value={p3} />

            {POSITIONS.map((pos, i) => (
              <div key={pos.key} className={`rounded-lg border p-3 ${pos.borderClass}`}>
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
              <p className="text-sm text-green-400">¡Predicción guardada correctamente!</p>
            )}

            <Button
              type="submit"
              disabled={pending || !p1 || !p2 || !p3}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {pending ? "Guardando..." : hasExisting ? "Actualizar predicción" : "Cargar predicción"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
