import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/lib/models/User";
import { Driver } from "@/lib/models/Driver";
import { Prediction } from "@/lib/models/Prediction";
import { Score } from "@/lib/models/Score";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { RaceResult } from "@/lib/models/RaceResult";
import { ProfileForm } from "./ProfileForm";

async function getUserProfile(userId: string, userName: string, userEmail: string, season: number) {
  await connectDB();

  const objectUserId = new Types.ObjectId(userId);

  const [dbUser, drivers, predictions, scores, gps] = await Promise.all([
    User.findById(objectUserId).select("favoriteDriverCode favoriteDriverHeadshot").lean(),
    Driver.find({ season, active: true }).sort({ lastName: 1 }).lean(),
    Prediction.find({ user: objectUserId }).lean(),
    Score.find({ user: objectUserId }).lean(),
    GrandPrix.find({ season }).sort({ round: 1 }).lean(),
  ]);

  const gpIds = gps.map((g) => g._id);
  const results = await RaceResult.find({ grandPrix: { $in: gpIds } })
    .select("grandPrix")
    .lean();

  const completedGpIds = new Set(results.map((r) => r.grandPrix.toString()));
  const completedGPs = gps.filter((g) => completedGpIds.has(g._id.toString()));

  // Exact hits: count positions where breakdown equals exact value
  let exactHits = 0;
  for (const s of scores) {
    if (s.breakdown.p1 === 10) exactHits++;
    if (s.breakdown.p2 === 7) exactHits++;
    if (s.breakdown.p3 === 5) exactHits++;
  }

  const totalPositions = predictions.length * 3;
  const exactHitPercent =
    totalPositions > 0 ? Math.round((exactHits / totalPositions) * 100) : 0;

  const totalPoints = scores.reduce((sum, s) => sum + s.points, 0);

  // Most predicted driver across all predictions
  const driverCountMap = new Map<string, number>();
  for (const p of predictions) {
    for (const pos of [p.p1, p.p2, p.p3]) {
      const dId = pos.toString();
      driverCountMap.set(dId, (driverCountMap.get(dId) ?? 0) + 1);
    }
  }

  let mostPredictedDriverId: string | null = null;
  let mostPredictedCount = 0;
  for (const [dId, count] of driverCountMap) {
    if (count > mostPredictedCount) {
      mostPredictedCount = count;
      mostPredictedDriverId = dId;
    }
  }

  const driverMap = new Map(drivers.map((d) => [d._id.toString(), d]));
  const mostPredictedDriver = mostPredictedDriverId
    ? driverMap.get(mostPredictedDriverId)
    : null;

  // Current streak: consecutive completed GPs with points > 0, backwards from latest
  let currentStreak = 0;
  const sortedCompleted = completedGPs.sort(
    (a, b) => b.round - a.round
  );
  const scoreMap = new Map<string, number>();
  for (const s of scores) {
    scoreMap.set(s.grandPrix.toString(), s.points);
  }

  for (const gp of sortedCompleted) {
    const pts = scoreMap.get(gp._id.toString());
    if (pts !== undefined && pts > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    name: userName,
    email: userEmail,
    headshotUrl: dbUser?.favoriteDriverHeadshot ?? undefined,
    favoriteDriverCode: dbUser?.favoriteDriverCode ?? undefined,
    driverOptions: drivers.map((d) => ({
      id: d._id.toString(),
      code: d.code,
      fullName: d.fullName,
      team: d.team,
      headshotUrl: d.headshotUrl,
    })),
    stats: {
      totalPredictions: predictions.length,
      exactHits,
      exactHitPercent,
      mostPredictedDriver: mostPredictedDriver?.fullName ?? null,
      mostPredictedDriverCode: mostPredictedDriver?.code ?? null,
      currentStreak,
      totalPoints,
    },
    season,
  };
}

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const season = new Date().getFullYear();
  const data = await getUserProfile(
    session.user.id,
    session.user.name,
    session.user.email,
    season
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Gestioná tu cuenta y revisá tus estadísticas
        </p>
      </div>

      <ProfileForm
        name={data.name}
        email={data.email}
        headshotUrl={data.headshotUrl}
        favoriteDriverCode={data.favoriteDriverCode}
        driverOptions={data.driverOptions}
        stats={data.stats}
        season={data.season}
      />
    </div>
  );
}
