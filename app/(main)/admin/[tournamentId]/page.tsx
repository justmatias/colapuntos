import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { GrandPrix } from "@/lib/models/GrandPrix";
import { Driver } from "@/lib/models/Driver";
import { RaceResult } from "@/lib/models/RaceResult";
import { User } from "@/lib/models/User";
import { AuditLog } from "@/lib/models/AuditLog";
import { ResultsForm } from "./ResultsForm";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { AuditLogPanel } from "./AuditLogPanel";

async function getAdminData(tournamentId: string, userId: string) {
  await connectDB();

  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) return null;
  if (tournament.creator.toString() !== userId) return null;

  const memberIds = (tournament.members as Types.ObjectId[]).map(
    (m) => new Types.ObjectId(m.toString())
  );
  const users = await User.find({ _id: { $in: memberIds } })
    .select("_id name")
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u.name as string]));

  const members = memberIds.map((id) => ({
    id: id.toString(),
    name: userMap.get(id.toString()) ?? "—",
    isCreator: id.toString() === userId,
  }));

  const now = new Date();
  const gps = await GrandPrix.find({
    season: tournament.season,
    raceDate: { $lte: now },
  })
    .sort({ round: 1 })
    .lean();

  const gpIds = gps.map((g) => g._id);
  const results = await RaceResult.find({ grandPrix: { $in: gpIds } }).lean();
  const resultMap = new Map(
    results.map((r) => [
      r.grandPrix.toString(),
      {
        p1: (r.p1 as Types.ObjectId).toString(),
        p2: (r.p2 as Types.ObjectId).toString(),
        p3: (r.p3 as Types.ObjectId).toString(),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
      },
    ])
  );

  const gpList = gps.map((gp) => {
    const existing = resultMap.get(gp._id.toString());
    return {
      id: gp._id.toString(),
      round: gp.round,
      name: gp.name,
      hasResult: !!existing,
      existingResult: existing ?? undefined,
    };
  });

  const drivers = await Driver.find({ season: tournament.season, active: true })
    .sort({ lastName: 1 })
    .lean();

  const driverList = drivers.map((d) => ({
    id: d._id.toString(),
    code: d.code,
    fullName: d.fullName,
    team: d.team,
    teamColour: d.teamColour,
    number: d.number,
  }));

  const auditLogs = await AuditLog.find({ tournament: tournament._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("user", "name")
    .populate("grandPrix", "name")
    .lean();

  const logEntries = auditLogs.map((log) => ({
    id: log._id.toString(),
    action: log.action as string,
    details: log.details,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : null,
    userName: (log.user as unknown as { name?: string }).name ?? "Sistema",
    gpName: (log.grandPrix as unknown as { name?: string } | null)?.name ?? null,
  }));

  return {
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name,
      season: tournament.season,
      inviteCode: tournament.inviteCode,
    },
    members,
    gpList,
    driverList,
    logEntries,
  };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const data = await getAdminData(tournamentId, session.user.id);
  if (!data) notFound();

  const { tournament, members, gpList, driverList, logEntries } = data;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Temporada {tournament.season}</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Cargar resultado de carrera</h2>
        {gpList.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No hay carreras pasadas para cargar resultados.
          </p>
        ) : (
          <ResultsForm
            tournamentId={tournament.id}
            gps={gpList}
            drivers={driverList}
          />
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Participantes
          <span className="ml-2 text-sm text-zinc-500 font-normal">
            ({members.length})
          </span>
        </h2>
        <ParticipantsPanel
          tournamentId={tournament.id}
          members={members}
          inviteCode={tournament.inviteCode}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Historial de cambios</h2>
        <AuditLogPanel entries={logEntries} />
      </section>
    </div>
  );
}
