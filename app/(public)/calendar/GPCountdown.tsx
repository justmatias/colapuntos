"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

interface Props {
  deadline: string;
  timezone: string;
}

export function GPCountdown({ deadline, timezone }: Props) {
  const [mounted, setMounted] = useState(false);
  const [parts, setParts] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    function tick() {
      try {
        const target = DateTime.fromISO(deadline, { zone: timezone });
        if (!target.isValid) {
          setError(true);
          return;
        }

        const now = DateTime.now();
        const diffMs = target.toMillis() - now.toMillis();

        if (diffMs <= 0) {
          setExpired(true);
          return;
        }

        const totalMinutes = Math.floor(diffMs / 60_000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;

        setParts({ days, hours, minutes });
      } catch {
        setError(true);
      }
    }

    tick();
    const id = setInterval(tick, 30_000);
    setMounted(true);
    return () => clearInterval(id);
  }, [deadline, timezone]);

  if (!mounted) return <span className="text-zinc-500 text-xs">—</span>;

  if (error) return <span className="text-zinc-500 text-xs">—</span>;

  if (expired) return <span className="text-zinc-500 text-xs">Cerrado</span>;

  return (
    <span className="text-xs font-mono tabular-nums text-amber-400" suppressHydrationWarning>
      {parts
        ? `${parts.days > 0 ? `${parts.days}d ` : ""}${parts.hours}h ${parts.minutes}m`
        : "—"}
    </span>
  );
}
