import { Skeleton } from "@/components/ui/skeleton";

export default function TournamentLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-8 ml-auto" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <Skeleton className="h-6 w-24 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
