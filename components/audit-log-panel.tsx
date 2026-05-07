import { ClipboardList, UserX, RefreshCw, CloudDownload, History, XCircle, RotateCcw } from "lucide-react";

type LogEntry = {
  id: string;
  action: string;
  details: string;
  createdAt: string | null;
  userName: string;
  gpName: string | null;
};

type Props = {
  entries: LogEntry[];
};

const ACTION_CONFIG: Record<string, { label: string; Icon: typeof ClipboardList }> = {
  save_result: { label: "Resultado manual", Icon: ClipboardList },
  sync_result: { label: "Sync automático", Icon: CloudDownload },
  remove_participant: { label: "Eliminó participante", Icon: UserX },
  regenerate_invite: { label: "Regeneró código", Icon: RefreshCw },
  save_retroactive_prediction: { label: "Carga de predicción", Icon: History },
  gp_cancelled: { label: "GP cancelado", Icon: XCircle },
  gp_uncancelled: { label: "GP reactivado", Icon: RotateCcw },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogPanel({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-zinc-500 text-sm">No hay cambios registrados aún.</p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      {entries.map((entry, i) => {
        const config = ACTION_CONFIG[entry.action] ?? {
          label: entry.action,
          Icon: ClipboardList,
        };
        const { Icon } = config;

        return (
          <div
            key={entry.id}
            className={`flex items-start gap-3 px-4 py-3 ${
              i < entries.length - 1 ? "border-b border-zinc-800" : ""
            }`}
          >
            <div className="mt-0.5 shrink-0">
              <Icon className="w-4 h-4 text-zinc-500" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-400 leading-relaxed truncate">
                {entry.details}
              </p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                {formatDate(entry.createdAt)}
                {entry.userName !== "Sistema" && (
                  <span className="ml-1">— {entry.userName}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
