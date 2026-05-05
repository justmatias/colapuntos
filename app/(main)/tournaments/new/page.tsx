import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db/mongoose";
import { Tournament } from "@/lib/models/Tournament";
import { NewTournamentForm } from "./NewTournamentForm";

export default async function NewTournamentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  await connectDB();
  const existing = await Tournament.findOne({
    creator: new Types.ObjectId(session.user.id),
  })
    .select("_id")
    .lean();

  if (existing) redirect("/dashboard");

  return <NewTournamentForm />;
}
