"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfileName } from "@/lib/actions/profile.actions";
import { updateFavoriteDriver } from "@/lib/actions/profile.actions";
import { toast } from "sonner";

interface DriverOption {
  id: string;
  code: string;
  fullName: string;
  team: string;
  headshotUrl?: string;
}

interface ProfileStats {
  totalPredictions: number;
  exactHits: number;
  exactHitPercent: number;
  mostPredictedDriver: string | null;
  mostPredictedDriverCode: string | null;
  currentStreak: number;
  totalPoints: number;
}

interface Props {
  name: string;
  email: string;
  headshotUrl?: string;
  favoriteDriverCode?: string;
  driverOptions: DriverOption[];
  stats: ProfileStats;
  season: number;
}

export function ProfileForm({
  name,
  email,
  headshotUrl,
  favoriteDriverCode,
  driverOptions,
  stats,
  season,
}: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSaveName() {
    if (!newName.trim() || newName.trim() === name) return;
    setSavingName(true);
    const result = await updateProfileName(newName.trim());
    setSavingName(false);
    if (result.success) {
      toast.success("Nombre actualizado");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleSelectDriver(code: string | null) {
    if (!code) return;
    setSavingDriver(true);
    const result = await updateFavoriteDriver(code, season);
    setSavingDriver(false);
    if (result.success) {
      toast.success("Piloto favorito actualizado");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-8">
      {/* Avatar + Name */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={headshotUrl} alt={name} />
            <AvatarFallback className="bg-red-700 text-white text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-400">Email</p>
            <p className="text-white truncate">{email}</p>
          </div>
        </div>
      </section>

      {/* Edit Name */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-3">Editar nombre</h2>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-zinc-950 border-zinc-700 text-white max-w-xs"
          />
          <Button
            onClick={handleSaveName}
            disabled={savingName || !newName.trim() || newName.trim() === name}
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white shrink-0"
          >
            {savingName ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </section>

      {/* Edit Avatar (via favorite driver) */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-3">Imagen de perfil</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Elegí tu piloto favorito para usar su foto como avatar
        </p>
        <Select
          value={favoriteDriverCode ?? ""}
          onValueChange={handleSelectDriver}
          disabled={savingDriver}
        >
          <SelectTrigger className="bg-zinc-950 border-zinc-700 text-white max-w-xs">
            <SelectValue placeholder="Seleccionar piloto" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700 text-white max-h-60">
            {driverOptions.map((d) => (
              <SelectItem key={d.id} value={d.code}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-zinc-400 text-xs">{d.code}</span>
                  <span>{d.fullName}</span>
                  <span className="text-zinc-500 text-xs">{d.team}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {favoriteDriverCode && (
          <p className="text-xs text-zinc-500 mt-2">
            Piloto actual:{" "}
            <span className="text-red-400 font-mono">{favoriteDriverCode}</span>
          </p>
        )}
      </section>

      {/* Stats */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-4">Estadísticas personales</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Predicciones" value={stats.totalPredictions} />
          <StatCard label="Puntos totales" value={stats.totalPoints} />
          <StatCard
            label="% Aciertos exactos"
            value={`${stats.exactHitPercent}%`}
          />
          <StatCard
            label="Piloto más predicho"
            value={
              stats.mostPredictedDriverCode
                ? `${stats.mostPredictedDriverCode}`
                : "—"
            }
          />
          <StatCard label="Racha actual" value={stats.currentStreak} />
          <StatCard
            label="Aciertos exactos"
            value={`${stats.exactHits}/${stats.totalPredictions * 3}`}
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
