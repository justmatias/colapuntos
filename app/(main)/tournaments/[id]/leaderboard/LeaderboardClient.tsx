"use client";

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type GPScore = {
  gpId: string;
  round: number;
  gpName: string;
  points: number;
  breakdown: { p1: number; p2: number; p3: number };
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  total: number;
  gpsPlayed: number;
  avgPerGP: number;
  bestGP: { name: string; points: number } | null;
  worstGP: { name: string; points: number } | null;
  gpScores: GPScore[];
};

const CHART_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const MEDAL = ["🥇", "🥈", "🥉"];

function BreakdownCell({ pts, exact }: { pts: number; exact: number }) {
  if (pts === exact) return <span className="text-green-400">{pts}</span>;
  if (pts === 3) return <span className="text-yellow-500">{pts}</span>;
  return <span className="text-zinc-600">{pts}</span>;
}

export function LeaderboardClient({
  entries,
  chartData,
  currentUserId,
  tournamentId,
}: {
  entries: LeaderboardEntry[];
  chartData: Record<string, number | string>[];
  currentUserId: string;
  tournamentId: string;
}) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [h2hA, setH2hA] = useState(entries[0]?.userId ?? "");
  const [h2hB, setH2hB] = useState(entries[1]?.userId ?? "");
  const [copied, setCopied] = useState(false);

  const userA = entries.find((e) => e.userId === h2hA);
  const userB = entries.find((e) => e.userId === h2hB);

  const h2hGPs =
    userA && userB && h2hA !== h2hB
      ? userA.gpScores
          .filter((ga) => userB.gpScores.some((gb) => gb.gpId === ga.gpId))
          .map((ga) => {
            const gb = userB.gpScores.find((g) => g.gpId === ga.gpId)!;
            return {
              gpId: ga.gpId,
              round: ga.round,
              gpName: ga.gpName,
              aPoints: ga.points,
              bPoints: gb.points,
            };
          })
          .sort((a, b) => a.round - b.round)
      : [];

  function handleShare() {
    const url = `${window.location.origin}/tournaments/${tournamentId}/leaderboard?highlight=${currentUserId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toggleExpand(userId: string, hasScores: boolean) {
    if (!hasScores) return;
    setExpandedUser(expandedUser === userId ? null : userId);
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <button
          onClick={handleShare}
          className="text-sm text-zinc-400 hover:text-white transition-colors border border-zinc-700 rounded-md px-3 py-1.5 w-full sm:w-auto"
        >
          {copied ? "¡Copiado!" : "Compartir mi posición"}
        </button>
      </div>

      {/* Main table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Posiciones</h2>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Jugador</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">GPs</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Prom.</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Mejor GP</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Peor GP</th>
                <th className="px-4 py-3 text-right font-bold">Pts</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <React.Fragment key={entry.userId}>
                  <tr
                    className={`border-b border-zinc-800 transition-colors ${
                      entry.gpScores.length > 0
                        ? "cursor-pointer hover:bg-zinc-800/30"
                        : ""
                    } ${entry.userId === currentUserId ? "bg-zinc-800/50" : ""}`}
                    onClick={() => toggleExpand(entry.userId, entry.gpScores.length > 0)}
                  >
                    <td className="px-4 py-3 font-mono text-zinc-400">
                      {MEDAL[entry.rank - 1] ?? entry.rank}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {entry.name}
                      {entry.userId === currentUserId && (
                        <span className="ml-2 text-xs text-zinc-500">(vos)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">
                      {entry.gpsPlayed}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">
                      {entry.gpsPlayed > 0 ? entry.avgPerGP : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {entry.bestGP ? (
                        <span className="text-green-400 font-medium">
                          {entry.bestGP.points} pts
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {entry.worstGP ? (
                        <span className="text-zinc-500">
                          {entry.worstGP.points} pts
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-white">
                      {entry.total}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600 text-xs">
                      {entry.gpScores.length > 0
                        ? expandedUser === entry.userId
                          ? "▲"
                          : "▼"
                        : ""}
                    </td>
                  </tr>

                  {expandedUser === entry.userId && entry.gpScores.length > 0 && (
                    <tr className="border-b border-zinc-800">
                      <td colSpan={8} className="px-6 py-4 bg-zinc-900/70">
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
                          Desglose por carrera
                        </p>
                        <div className="space-y-2">
                          {entry.gpScores.map((gs) => (
                            <div key={gs.gpId} className="flex items-center gap-3 text-sm">
                              <span className="text-zinc-600 font-mono text-xs w-6 text-center">
                                {gs.round}
                              </span>
                              <span className="text-zinc-400 flex-1 truncate min-w-0">
                                {gs.gpName}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                                <span>P1: <BreakdownCell pts={gs.breakdown.p1} exact={10} /></span>
                                <span className="text-zinc-700">·</span>
                                <span>P2: <BreakdownCell pts={gs.breakdown.p2} exact={7} /></span>
                                <span className="text-zinc-700">·</span>
                                <span>P3: <BreakdownCell pts={gs.breakdown.p3} exact={5} /></span>
                              </div>
                              <span className="font-bold text-white w-14 text-right shrink-0">
                                {gs.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Points evolution chart */}
      {chartData.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Evolución de puntos</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="round"
                  stroke="#52525b"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  label={{
                    value: "Ronda",
                    position: "insideBottomRight",
                    offset: -5,
                    fill: "#52525b",
                    fontSize: 11,
                  }}
                />
                <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#a1a1aa", marginBottom: "4px" }}
                  itemStyle={{ color: "#e4e4e7" }}
                  formatter={(value, dataKey) => {
                    const key = String(dataKey ?? "");
                    const entry = entries.find((e) => e.userId === key);
                    return [`${value} pts`, entry?.name ?? key];
                  }}
                  labelFormatter={(label) => {
                    const point = chartData.find((d) => d.round === label);
                    return `Ronda ${label}${point?.name ? ` — ${point.name}` : ""}`;
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const entry = entries.find((e) => e.userId === value);
                    return entry?.name ?? value;
                  }}
                  wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                />
                {entries
                  .filter((e) => e.gpsPlayed > 0)
                  .map((entry, i) => (
                    <Line
                      key={entry.userId}
                      type="monotone"
                      dataKey={entry.userId}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={entry.userId === currentUserId ? 2.5 : 1.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Head-to-head */}
      {entries.length >= 2 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Head-to-head</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={h2hA}
                onChange={(e) => setH2hA(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-600 w-full sm:w-auto max-w-48 truncate"
              >
                {entries.map((e) => (
                  <option key={e.userId} value={e.userId}>
                    {e.name}
                  </option>
                ))}
              </select>
              <span className="text-zinc-500 font-bold text-lg">vs</span>
              <select
                value={h2hB}
                onChange={(e) => setH2hB(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-600 w-full sm:w-auto max-w-48 truncate"
              >
                {entries.map((e) => (
                  <option key={e.userId} value={e.userId}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            {h2hA === h2hB ? (
              <p className="text-zinc-500 text-sm">
                Seleccioná dos usuarios distintos.
              </p>
            ) : h2hGPs.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                No hay carreras en común todavía.
              </p>
            ) : (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-4 py-2.5 text-left">Carrera</th>
                      <th className="px-4 py-2.5 text-right" style={{ color: CHART_COLORS[entries.findIndex(e => e.userId === h2hA) % CHART_COLORS.length] }}>
                        {userA?.name}
                      </th>
                      <th className="px-3 py-2.5 text-center text-zinc-700 w-6">—</th>
                      <th className="px-4 py-2.5 text-left" style={{ color: CHART_COLORS[entries.findIndex(e => e.userId === h2hB) % CHART_COLORS.length] }}>
                        {userB?.name}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hGPs.map((row) => {
                      const aWins = row.aPoints > row.bPoints;
                      const bWins = row.bPoints > row.aPoints;
                      return (
                        <tr key={row.gpId} className="border-b border-zinc-800/50">
                          <td className="px-4 py-2.5 text-zinc-400">
                            <span className="font-mono text-xs text-zinc-600 mr-2">
                              {row.round}
                            </span>
                            {row.gpName}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-bold ${
                              aWins ? "text-green-400" : "text-zinc-500"
                            }`}
                          >
                            {row.aPoints}
                          </td>
                          <td className="px-3 py-2.5 text-center text-zinc-700 text-xs">
                            —
                          </td>
                          <td
                            className={`px-4 py-2.5 font-bold ${
                              bWins ? "text-green-400" : "text-zinc-500"
                            }`}
                          >
                            {row.bPoints}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totalA = h2hGPs.reduce((s, r) => s + r.aPoints, 0);
                      const totalB = h2hGPs.reduce((s, r) => s + r.bPoints, 0);
                      return (
                        <tr className="border-t border-zinc-700 bg-zinc-900/80">
                          <td className="px-4 py-2.5 text-zinc-400 font-medium text-xs uppercase tracking-wide">
                            Total
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-bold ${
                              totalA > totalB ? "text-green-400" : "text-white"
                            }`}
                          >
                            {totalA}
                          </td>
                          <td></td>
                          <td
                            className={`px-4 py-2.5 font-bold ${
                              totalB > totalA ? "text-green-400" : "text-white"
                            }`}
                          >
                            {totalB}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
