"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MainError]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="rounded-full bg-red-900/30 p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-red-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Algo salió mal</h2>
        <p className="text-zinc-400 text-sm">
          Ocurrió un error inesperado. Por favor intentá de nuevo.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={reset}
          className={cn(
            buttonVariants(),
            "bg-red-600 hover:bg-red-700 text-white"
          )}
        >
          Volver a intentar
        </button>
        <Link
          href="/"
          className={buttonVariants({ variant: "outline" })}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
