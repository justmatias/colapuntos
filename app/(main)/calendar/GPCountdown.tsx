"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

interface Props {
  deadline: string; // ISO date string
  timezone: string;
}

export function GPCountdown({ deadline, timezone }: Props) {
  const [mounted, setMounted] = useState(false);
  const [parts, setParts] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    function tick() {
      const now = DateTime.now();
      const target = DateTime.fromISO(deadline, { zone: timezone });
      const diff = target.diff(now, ["days", "hours", "minutes"]);

      if (diff.milliseconds <= 0) {
        setExpired(true);
        return;
      }

      setParts({
        days: Math.floor(diff.days),
        hours: Math.floor(diff.hours),
        minutes: Math.floor(Math.round(diff.minutes)),
      });
    }

    tick();
    const id = setInterval(tick, 30_000);
    setMounted(true);
    return () => clearInterval(id);
  }, [deadline, timezone]);

  if (!mounted) return <span className="text-zinc-500 text-xs">—</span>;

  if (expired) return <span className="text-zinc-500 text-xs">Cerrado</span>;

  return (
    <span className="text-xs font-mono tabular-nums text-amber-400" suppressHydrationWarning>
      {parts
        ? `${parts.days > 0 ? `${parts.days}d ` : ""}${parts.hours}h ${parts.minutes}m`
        : "—"}
    </span>
  );
}
