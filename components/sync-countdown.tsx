"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

export function SyncCountdown() {
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    function tick() {
      const now = DateTime.utc();
      let next = now.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
      if (now >= next) next = next.plus({ days: 1 });

      const diffMs = next.toMillis() - now.toMillis();
      const totalMinutes = Math.floor(diffMs / 60_000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      setLabel(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }

    tick();
    setMounted(true);
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  return (
    <p className="text-xs text-zinc-500" suppressHydrationWarning>
      Resultados pendientes · próxima sincronización en{" "}
      <span className="font-mono text-zinc-400">{label ?? "—"}</span>
    </p>
  );
}
