import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Score } from "@/lib/models/Score";
import { User } from "@/lib/models/User";
import { LeaderboardClient, type LeaderboardEntry, type GPScore } from "./LeaderboardClient";

async function getLeaderboardData(tournamentId: string, userId: string) {
  await connectDB();

  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) return null;

  const isMember = (tournament.members as Types.ObjectId[]).some(
    (m) => m.toString() === userId
  );
  if (!isMember) return null;

  const memberIds = (tournament.members as Types.ObjectId[]).map(
    (m) => new Types.ObjectId(m.toString())
  );

  const [users, gps, scores] = await Promise.all([
    User.find({ _id: { $in: memberIds } }).select("_id name").lean(),
    GrandPrix.find({ season: tournament.season }).sort({ round: 1 }).lean(),
    Score.find({
      tournament: new Types.ObjectId(tournamentId),
      user: { $in: memberIds },
    }).lean(),
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u.name as string]));
  const gpMap = new Map(
    gps.map((g) => [g._id.toString(), { name: g.name as string, round: g.round }])
  );

  // Group scores by user
  const userScoresMap = new Map<string, GPScore[]>();
  for (const score of scores) {
    const uid = score.user.toString();
    const gpId = score.grandPrix.toString();
    const gp = gpMap.get(gpId);
    if (!gp) continue;
    if (!userScoresMap.has(uid)) userScoresMap.set(uid, []);
    userScoresMap.get(uid)!.push({
      gpId,
      round: gp.round,
      gpName: gp.name,
      points: score.points,
      breakdown: score.breakdown,
    });
  }

  for (const gpScores of userScoresMap.values()) {
    gpScores.sort((a, b) => a.round - b.round);
  }

  const entries: LeaderboardEntry[] = memberIds.map((mid) => {
    const uid = mid.toString();
    const gpScores = userScoresMap.get(uid) ?? [];
    const total = gpScores.reduce((s, g) => s + g.points, 0);
    const gpsPlayed = gpScores.length;
    const avgPerGP =
      gpsPlayed > 0 ? Math.round((total / gpsPlayed) * 10) / 10 : 0;

    const bestGP =
      gpScores.length > 0
        ? gpScores.reduce((a, b) => (a.points >= b.points ? a : b))
        : null;
    const worstGP =
      gpScores.length > 0
        ? gpScores.reduce((a, b) => (a.points <= b.points ? a : b))
        : null;

    return {
      rank: 0,
      userId: uid,
      name: userMap.get(uid) ?? "—",
      total,
      gpsPlayed,
      avgPerGP,
      bestGP: bestGP ? { name: bestGP.gpName, points: bestGP.points } : null,
      worstGP: worstGP ? { name: worstGP.gpName, points: worstGP.points } : null,
      gpScores,
      streak: computeStreak(gpScores),
    };
  });

  entries.sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name)
  );
  entries.forEach((e, i) => (e.rank = i + 1));

  // Build cumulative chart data: one point per completed GP
  const scoredGPIds = new Set(scores.map((s) => s.grandPrix.toString()));
  const completedGPs = gps.filter((g) => scoredGPIds.has(g._id.toString()));

  const finishedGPs = gps.filter((g) => g.status === "completed");

  function computeStreak(gpScores: GPScore[]): number {
    const scoreByGpId = new Map(gpScores.map((s) => [s.gpId, s.points]));
    let streak = 0;
    for (let i = finishedGPs.length - 1; i >= 0; i--) {
      const pts = scoreByGpId.get(finishedGPs[i]._id.toString()) ?? 0;
      if (pts > 0) streak++;
      else break;
    }
    return streak;
  }

  const chartData: Record<string, number | string>[] = completedGPs.map((gp) => {
    const point: Record<string, number | string> = {
      round: gp.round,
      name: gp.name as string,
    };
    for (const entry of entries) {
      point[entry.userId] = entry.gpScores
        .filter((s) => s.round <= gp.round)
        .reduce((sum, s) => sum + s.points, 0);
    }
    return point;
  });

  return {
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name as string,
      season: tournament.season,
    },
    entries,
    chartData,
    currentUserId: userId,
  };
}

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const data = await getLeaderboardData(id, session.user.id);
  if (!data) notFound();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
          <Link
            href={`/tournaments/${id}`}
            className="hover:text-zinc-300 transition-colors"
          >
            {data.tournament.name}
          </Link>
          <span>/</span>
          <span>Leaderboard</span>
        </div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Temporada {data.tournament.season}
        </p>
      </div>

      <LeaderboardClient
        entries={data.entries}
        chartData={data.chartData}
        currentUserId={data.currentUserId}
        tournamentId={id}
      />
    </div>
  );
}
