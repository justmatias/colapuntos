import "dotenv/config";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { Types } from "mongoose";
import { recalculateScoresForGP } from "../lib/scoring-recalc";
import { SessionResult } from "../lib/models/SessionResult";
import {
  fetchOpenF1,
  fetchMeetings,
  fetchSessionsForYear,
  fetchSessionsForMeeting,
  fetchWeather,
  type OpenF1Meeting,
  type OpenF1Session,
  type OpenF1Driver,
} from "../lib/openf1";
import { syncSessionResults } from "../lib/session-results";

// ── Mongoose models (inline to avoid Next.js module issues in tsx) ─────────────

const DriverSchema = new mongoose.Schema(
  {
    season: { type: Number, required: true },
    code: { type: String, required: true, uppercase: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fullName: { type: String, required: true },
    number: { type: Number, required: true },
    team: { type: String, required: true },
    teamColour: { type: String },
    headshotUrl: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
DriverSchema.index({ code: 1, season: 1 }, { unique: true });

const GrandPrixSchema = new mongoose.Schema(
  {
    season: { type: Number, required: true },
    round: { type: Number, required: true },
    name: { type: String, required: true },
    country: { type: String, required: true },
    circuit: { type: String, required: true },
    timezone: { type: String, required: true },
    raceDate: { type: Date, required: true },
    predictionDeadline: { type: Date, required: true },
    status: {
      type: String,
      enum: ["upcoming", "open", "closed", "completed"],
      default: "upcoming",
    },
    cancelled: { type: Boolean, default: false },
    meetingKey: { type: Number },
    raceSessionKey: { type: Number },
    qualifyingSessionKey: { type: Number },
    sprintSessionKey: { type: Number },
    countryFlag: { type: String },
    circuitImage: { type: String },
    gmtOffset: { type: String },
    weatherCondition: { type: String, enum: ["dry", "wet", "mixed"] },
  },
  { timestamps: true }
);
GrandPrixSchema.index({ season: 1, round: 1 }, { unique: true });

const RaceResultSchema = new mongoose.Schema(
  {
    grandPrix: { type: mongoose.Schema.Types.ObjectId, ref: "GrandPrix", required: true, unique: true },
    p1: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
    p2: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
    p3: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
  },
  { timestamps: true }
);

const Driver =
  mongoose.models.Driver ?? mongoose.model("Driver", DriverSchema);
const GrandPrix =
  mongoose.models.GrandPrix ?? mongoose.model("GrandPrix", GrandPrixSchema);
const RaceResult =
  mongoose.models.RaceResult ?? mongoose.model("RaceResult", RaceResultSchema);

// ── Timezone map (IANA) by country_code ──────────────────────────────────────
// OpenF1 gives gmt_offset but not IANA names — we need IANA for Luxon DST handling

const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  AU: "Australia/Melbourne",
  CN: "Asia/Shanghai",
  JP: "Asia/Tokyo",
  BH: "Asia/Bahrain",
  SA: "Asia/Riyadh",
  US: "America/New_York",
  IT: "Europe/Rome",
  MC: "Europe/Monaco",
  ES: "Europe/Madrid",
  CA: "America/Montreal",
  AT: "Europe/Vienna",
  GB: "Europe/London",
  HU: "Europe/Budapest",
  BE: "Europe/Brussels",
  NL: "Europe/Amsterdam",
  AZ: "Asia/Baku",
  SG: "Asia/Singapore",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
};

// Override for circuits where country_code alone is ambiguous (multiple US circuits, etc.)
const TIMEZONE_BY_CIRCUIT: Record<string, string> = {
  Miami: "America/New_York",
  Austin: "America/Chicago",
  "Las Vegas": "America/Los_Angeles",
  Imola: "Europe/Rome",
  Barcelona: "Europe/Madrid",
  Monza: "Europe/Rome",
  Lusail: "Asia/Qatar",
};

function resolveTimezone(countryCode: string, circuitName: string): string {
  for (const [key, tz] of Object.entries(TIMEZONE_BY_CIRCUIT)) {
    if (circuitName.includes(key)) return tz;
  }
  return TIMEZONE_BY_COUNTRY[countryCode] ?? "UTC";
}

// ── Deadline calculation ──────────────────────────────────────────────────────
// Friday 23:59 local time in the circuit's timezone, before race day (Sunday)

function computeDeadline(raceDateUtc: string, timezone: string): Date {
  const raceLocal = DateTime.fromISO(raceDateUtc, { zone: "UTC" }).setZone(timezone);
  let deadline = raceLocal.startOf("day").minus({ days: 2 });
  while (deadline.weekday !== 5) {
    deadline = deadline.minus({ days: 1 });
  }
  deadline = deadline.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
  return deadline.toUTC().toJSDate();
}

// ── Seed drivers ──────────────────────────────────────────────────────────────

async function seedDrivers(season: number) {
  console.log(`\n▶ Cargando drivers para temporada ${season}…`);
  // Resolve the most recent past main Race session so we get the correct season roster.
  // session_key=latest can resolve to a session from a different season during the offseason.
  const raceSessions = await fetchSessionsForYear(season);
  const pastRace = raceSessions
    .filter((s) => s.session_name === "Race" && new Date(s.date_start) < new Date())
    .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())[0];
  const endpoint = pastRace
    ? `/drivers?session_key=${pastRace.session_key}`
    : `/drivers?session_key=latest`;
  console.log(`  · Fuente: ${endpoint}${pastRace ? ` (sesión ${pastRace.session_key} — ${pastRace.session_name})` : ""}`);
  const drivers = await fetchOpenF1<OpenF1Driver[]>(endpoint);
  console.log(`  · ${drivers.length} drivers recibidos de OpenF1`);

  let upserted = 0;
  let skipped = 0;
  for (const d of drivers) {
    if (!d.name_acronym || !d.driver_number) {
      skipped++;
      continue;
    }
    await Driver.findOneAndUpdate(
      { code: d.name_acronym.toUpperCase(), season },
      {
        season,
        code: d.name_acronym.toUpperCase(),
        firstName: d.first_name ?? "",
        lastName: d.last_name ?? "",
        fullName: d.full_name ?? `${d.first_name} ${d.last_name}`,
        number: d.driver_number,
        team: d.team_name ?? "Unknown",
        teamColour: d.team_colour ? `#${d.team_colour}` : undefined,
        headshotUrl: d.headshot_url ?? undefined,
        active: true,
      },
      { upsert: true, new: true }
    );
    upserted++;
  }
  console.log(`  ✓ ${upserted} drivers upserted${skipped ? ` (${skipped} omitidos por datos incompletos)` : ""}`);
}

// ── Seed calendar ─────────────────────────────────────────────────────────────
// Uses race session date when available; falls back to meeting date_end for
// provisional calendars where sessions haven't been scheduled yet.

async function seedCalendar(season: number) {
  console.log(`\n▶ Cargando calendario ${season} desde OpenF1…`);

  const meetings = await fetchMeetings(season);
  const sessions = await fetchSessionsForYear(season);
  console.log(`  · ${meetings.length} meetings y ${sessions.length} sesiones recibidos`);

  if (meetings.length === 0) {
    console.log(`  ⚠ No se encontraron meetings para ${season}, salteando`);
    return;
  }

  // Distinguish main Race from Sprint using session_name
  const mainRaceSessions = sessions.filter(
    (s) => s.session_type === "Race" && s.session_name === "Race"
  );
  const sprintSessions = sessions.filter(
    (s) => s.session_type === "Race" && s.session_name === "Sprint"
  );

  const raceByMeeting = new Map<number, OpenF1Session>(
    mainRaceSessions.map((s) => [s.meeting_key, s])
  );
  const sprintByMeeting = new Map<number, OpenF1Session>(
    sprintSessions.map((s) => [s.meeting_key, s])
  );

  const qualSessions = sessions.filter((s) => s.session_type === "Qualifying");
  const qualByMeeting = new Map<number, OpenF1Session>(
    qualSessions.map((s) => [s.meeting_key, s])
  );

  // Exclude pre-season testing events; sort chronologically so round numbers are stable.
  const raceWeekends = meetings
    .filter((m) => !/pre.?season|testing/i.test(m.meeting_name))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  if (raceWeekends.length === 0) {
    console.log(`  ⚠ No se encontraron fines de semana de carrera para ${season}, salteando`);
    return;
  }
  console.log(
    `  · ${raceWeekends.length} fines de semana válidos · ` +
      `${mainRaceSessions.length} carreras · ${qualSessions.length} clasificaciones · ${sprintSessions.length} sprints`
  );

  // Temporarily shift all existing round numbers into the 90000+ range so the
  // (season, round) unique index never conflicts when we re-assign rounds below.
  // This is safe even if OpenF1 adds/removes events between seed runs.
  const existingDocs = await GrandPrix.find({ season }).select("_id round").lean();
  for (let j = 0; j < existingDocs.length; j++) {
    await GrandPrix.updateOne({ _id: existingDocs[j]._id }, { round: 90000 + j });
  }

  let upserted = 0;
  let provisional = 0;
  let cancelledCount = 0;
  const validMeetingKeys = raceWeekends.map((m) => m.meeting_key);

  for (let i = 0; i < raceWeekends.length; i++) {
    const m = raceWeekends[i];
    const raceSession = raceByMeeting.get(m.meeting_key);
    const sprintSession = sprintByMeeting.get(m.meeting_key);
    const qualSession = qualByMeeting.get(m.meeting_key);
    const timezone = resolveTimezone(m.country_code, m.circuit_short_name);

    // Use race session date if available, otherwise fall back to meeting date_end
    const raceDateStr = raceSession?.date_start ?? m.date_end;
    const raceDate = new Date(raceDateStr);
    const predictionDeadline = computeDeadline(raceDateStr, timezone);

    const sessionTags = [
      raceSession ? `R:${raceSession.session_key}` : null,
      qualSession ? `Q:${qualSession.session_key}` : null,
      sprintSession ? `S:${sprintSession.session_key}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  · R${i + 1} ${m.meeting_name} (${m.country_code}/${m.circuit_short_name}) ` +
        `tz=${timezone} race=${raceDate.toISOString()} [${sessionTags || "sin sesiones"}]` +
        (m.is_cancelled ? " ✗ cancelado" : "") +
        (!raceSession ? " ~ provisional" : "")
    );

    if (!raceSession) {
      provisional++;
    }

    if (m.is_cancelled) {
      cancelledCount++;
    }

    // Use meetingKey as the stable identifier so the same GP document (ObjectId) is
    // always updated regardless of round number changes. This keeps RaceResult /
    // Prediction / Score references correct across re-seeds.
    await GrandPrix.findOneAndUpdate(
      { season, meetingKey: m.meeting_key },
      {
        season,
        round: i + 1,
        name: m.meeting_name,
        country: m.country_name,
        circuit: m.circuit_short_name,
        timezone,
        raceDate,
        predictionDeadline,
        meetingKey: m.meeting_key,
        cancelled: m.is_cancelled,
        ...(raceSession ? { raceSessionKey: raceSession.session_key } : {}),
        ...(sprintSession ? { sprintSessionKey: sprintSession.session_key } : {}),
        ...(qualSession ? { qualifyingSessionKey: qualSession.session_key } : {}),
        countryFlag: m.country_flag ?? undefined,
        circuitImage: m.circuit_image ?? undefined,
        gmtOffset: raceSession?.gmt_offset ?? m.gmt_offset,
      },
      { upsert: true, new: true }
    );
    upserted++;
  }

  // Delete stale documents (e.g. pre-season testing events that were previously seeded).
  const stale = await GrandPrix.deleteMany({
    season,
    meetingKey: { $nin: validMeetingKeys },
  });
  if (stale.deletedCount > 0) {
    console.log(`  ✗ ${stale.deletedCount} stale entrie(s) removed (e.g. testing events)`);
  }

  console.log(
    `  ✓ ${upserted} grands prix upserted` +
      (provisional > 0 ? ` (${provisional} provisional — no race session yet)` : "") +
      (cancelledCount > 0 ? ` · ${cancelledCount} cancelado(s)` : "")
  );
}

// ── Seed past results ─────────────────────────────────────────────────────────
// For each past GP: sync ALL session types (P1, P2, P3, Qualifying, Race,
// Sprint Qualifying, Sprint) from OpenF1 via meetings → sessions → session_result → drivers.
// Only trust OpenF1's is_cancelled flag for cancellations.

async function seedPastResults(season: number) {
  console.log(`\n▶ Sincronizando resultados pasados para ${season}…`);

  // Use 3h buffer so a race that just ended has time to appear in OpenF1
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const pastGPs = await GrandPrix.find({
    season,
    raceDate: { $lte: cutoff },
    cancelled: { $ne: true },
    meetingKey: { $exists: true },
  })
    .sort({ round: 1 })
    .lean();

  console.log(`  · ${pastGPs.length} GPs pasados a procesar`);

  let syncedGPs = 0;
  let skippedGPs = 0;

  for (const gp of pastGPs) {
    console.log(`\n  R${gp.round} ${gp.name} (meeting ${gp.meetingKey}):`);

    // Fetch all sessions for this meeting from OpenF1
    let sessions: OpenF1Session[];
    try {
      sessions = await fetchSessionsForMeeting(gp.meetingKey!);
    } catch (err) {
      console.log(`    ⚠ No se pudieron obtener sesiones: ${err instanceof Error ? err.message : err}`);
      skippedGPs++;
      continue;
    }

    // Sort chronologically
    sessions.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    console.log(`    · ${sessions.length} sesiones recibidas: ${sessions.map((s) => s.session_name).join(", ")}`);

    let raceSessionResults: { code: string }[] | null = null;

    for (const s of sessions) {
      const isPast = new Date(s.date_end) <= cutoff;
      if (!isPast) continue;

      // Skip if already in DB
      const alreadySynced = await SessionResult.findOne({ sessionKey: s.session_key }).lean();
      if (alreadySynced) {
        console.log(`    ⏹ ${s.session_name}: ya existe en DB`);
        if (s.session_name === "Race") {
          raceSessionResults = alreadySynced.results.map((r: { code: string }) => ({ code: r.code }));
        }
        continue;
      }

      try {
        const results = await syncSessionResults(s.session_key, gp._id.toString());
        if (results.length > 0) {
          console.log(`    ✓ ${s.session_name}: P1 ${results[0].code}, P2 ${results[1]?.code ?? "–"}, P3 ${results[2]?.code ?? "–"}`);
          if (s.session_name === "Race") {
            raceSessionResults = results;
          }
        } else {
          console.log(`    ~ ${s.session_name}: sin resultados aún`);
        }
      } catch (err) {
        console.log(`    ⚠ ${s.session_name}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    // Create RaceResult if we have race podium and it doesn't exist yet
    if (raceSessionResults && raceSessionResults.length >= 3) {
      const existingRaceResult = await RaceResult.findOne({ grandPrix: gp._id }).lean();
      if (existingRaceResult) {
        console.log(`    ⏹ RaceResult: ya existe — protegido`);
      } else {
        const codes = raceSessionResults.slice(0, 3).map((r) => r.code);
        const driverDocs = await Driver.find({ season, code: { $in: codes } })
          .select("code")
          .lean();
        const driverByCode = new Map(driverDocs.map((d) => [d.code, d]));
        const p1 = driverByCode.get(codes[0]);
        const p2 = driverByCode.get(codes[1]);
        const p3 = driverByCode.get(codes[2]);

        if (!p1 || !p2 || !p3) {
          console.log(`    ⚠ Códigos no encontrados en DB: ${codes.join(", ")}`);
          skippedGPs++;
          continue;
        }

        await RaceResult.create({ grandPrix: gp._id, p1: p1._id, p2: p2._id, p3: p3._id });

        let wc: "dry" | "wet" | "mixed" | null = null;
        if (gp.raceSessionKey) {
          try {
            const weatherData = await fetchWeather(gp.raceSessionKey);
            if (weatherData.length > 0) {
              const wetCount = weatherData.filter((w) => w.rainfall > 0).length;
              const ratio = wetCount / weatherData.length;
              wc = ratio === 0 ? "dry" : ratio > 0.5 ? "wet" : "mixed";
            }
          } catch {
            // best-effort
          }
        }

        await GrandPrix.findByIdAndUpdate(gp._id, {
          status: "completed",
          ...(wc ? { weatherCondition: wc } : {}),
        });

        const weatherTag = wc ? ` [${wc}]` : "";
        console.log(`    ✓ RaceResult guardado: P1 ${codes[0]}, P2 ${codes[1]}, P3 ${codes[2]}${weatherTag}`);
        syncedGPs++;
      }
    } else if (!raceSessionResults) {
      if (gp.raceSessionKey) {
        console.log(`    ~ Sin resultados de carrera aún (se reintentará)`);
      } else {
        console.log(`    ~ Sin raceSessionKey (se reintentará)`);
      }
      skippedGPs++;
    }
  }

  const parts = [];
  if (syncedGPs) parts.push(`${syncedGPs} GPs con nuevos resultados`);
  if (skippedGPs) parts.push(`${skippedGPs} omitidos (reintentar)`);
  console.log(`\n  → ${parts.join(", ") || "nada que hacer"}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set in environment");

  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log("Connected.");

  try {
    const season = new Date().getFullYear();
    await seedDrivers(season);
    await seedCalendar(season);
    await seedPastResults(season);

    // Recalculate all scores for GPs that now have results
    const results = await RaceResult.find({}).select("grandPrix").lean();
    const gpIds = [...new Set(results.map((r) => r.grandPrix.toString()))];
    if (gpIds.length > 0) {
      console.log(`\nRecalculating scores for ${gpIds.length} GPs…`);
      for (const gpId of gpIds) {
        await recalculateScoresForGP(gpId);
      }
      console.log(`  ✓ Scores recalculated`);
    }
  } finally {
    await mongoose.disconnect();
    console.log("\nDone. Disconnected from MongoDB.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
