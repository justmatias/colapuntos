import "dotenv/config";
import mongoose from "mongoose";
import { DateTime } from "luxon";

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

// ── OpenF1 types ──────────────────────────────────────────────────────────────

interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  country_name: string;
  country_code: string;
  country_flag?: string;
  circuit_short_name: string;
  circuit_image?: string;
  location: string;
  date_start: string;
  gmt_offset: string;
}

interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  gmt_offset: string;
}

interface OpenF1Driver {
  driver_number: number;
  first_name: string;
  last_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour?: string;
  headshot_url?: string;
}

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

// ── OpenF1 fetcher ────────────────────────────────────────────────────────────

const BASE_URL = "https://api.openf1.org/v1";

async function fetchOpenF1<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`OpenF1 ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Seed drivers ──────────────────────────────────────────────────────────────

async function seedDrivers(season: number) {
  console.log(`\nFetching drivers for season ${season}…`);
  // Resolve the most recent past Race session so we get the correct season roster.
  // session_key=latest can resolve to a session from a different season during the offseason.
  const raceSessions = await fetchOpenF1<OpenF1Session[]>(`/sessions?year=${season}&session_type=Race`);
  const pastRace = raceSessions
    .filter((s) => new Date(s.date_start) < new Date())
    .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())[0];
  const endpoint = pastRace
    ? `/drivers?session_key=${pastRace.session_key}`
    : `/drivers?session_key=latest`;
  const drivers = await fetchOpenF1<OpenF1Driver[]>(endpoint);

  let upserted = 0;
  for (const d of drivers) {
    if (!d.name_acronym || !d.driver_number) continue;
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
  console.log(`  ✓ ${upserted} drivers upserted`);
}

// ── Seed calendar ─────────────────────────────────────────────────────────────
// Uses race session date when available; falls back to meeting date_start for
// provisional calendars where sessions haven't been scheduled yet.

async function seedCalendar(season: number) {
  console.log(`\nFetching calendar for ${season} from OpenF1…`);

  const [meetings, sessions] = await Promise.all([
    fetchOpenF1<OpenF1Meeting[]>(`/meetings?year=${season}`),
    fetchOpenF1<OpenF1Session[]>(`/sessions?year=${season}`),
  ]);

  if (meetings.length === 0) {
    console.log(`  ⚠ No meetings found for ${season}, skipping`);
    return;
  }

  const raceSessions = sessions.filter((s) => s.session_type === "Race");
  const raceByMeeting = new Map<number, OpenF1Session>(
    raceSessions.map((s) => [s.meeting_key, s])
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
    console.log(`  ⚠ No race weekends found for ${season}, skipping`);
    return;
  }

  let upserted = 0;
  let provisional = 0;

  for (let i = 0; i < raceWeekends.length; i++) {
    const m = raceWeekends[i];
    const raceSession = raceByMeeting.get(m.meeting_key);
    const qualSession = qualByMeeting.get(m.meeting_key);
    const timezone = resolveTimezone(m.country_code, m.circuit_short_name);

    // Use race session date if available, otherwise fall back to meeting date_start
    const raceDateStr = raceSession?.date_start ?? m.date_start;
    const raceDate = new Date(raceDateStr);
    const predictionDeadline = computeDeadline(raceDateStr, timezone);

    if (!raceSession) {
      provisional++;
      console.log(`  ~ Round ${i + 1}: ${m.meeting_name} (no race session yet, using meeting date)`);
    }

    await GrandPrix.findOneAndUpdate(
      { season, round: i + 1 },
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
        ...(raceSession ? { raceSessionKey: raceSession.session_key } : {}),
        ...(qualSession ? { qualifyingSessionKey: qualSession.session_key } : {}),
        countryFlag: m.country_flag ?? undefined,
        circuitImage: m.circuit_image ?? undefined,
        gmtOffset: raceSession?.gmt_offset ?? m.gmt_offset,
      },
      { upsert: true, new: true }
    );
    upserted++;
  }

  console.log(
    `  ✓ ${upserted} grands prix upserted` +
      (provisional > 0 ? ` (${provisional} provisional — no race session yet)` : "")
  );
}

// ── Weather helper ────────────────────────────────────────────────────────────

async function fetchWeatherCondition(
  raceSessionKey: number
): Promise<"dry" | "wet" | "mixed" | null> {
  try {
    const res = await fetch(`${BASE_URL}/weather?session_key=${raceSessionKey}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { rainfall: number }[];
    if (data.length === 0) return null;
    const wetCount = data.filter((w) => w.rainfall > 0).length;
    const ratio = wetCount / data.length;
    return ratio === 0 ? "dry" : ratio > 0.5 ? "wet" : "mixed";
  } catch {
    return null;
  }
}

// ── Seed past results ─────────────────────────────────────────────────────────
// For each past GP: fetch podium from OpenF1 and store it.
// If no data is available (no raceSessionKey or empty results), mark as cancelled.

interface OpenF1SessionResult {
  position: number;
  driver_number: number;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
}

async function seedPastResults(season: number) {
  console.log(`\nSyncing past race results for ${season}…`);

  // Use 3h buffer so a race that just ended has time to appear in OpenF1
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const pastGPs = await GrandPrix.find({
    season,
    raceDate: { $lte: cutoff },
  })
    .sort({ round: 1 })
    .lean();

  let synced = 0;
  let alreadyDone = 0;
  let cancelled = 0;
  let skipped = 0;

  for (const gp of pastGPs) {
    // No race session in OpenF1 → cancelled
    if (!gp.raceSessionKey) {
      if (!gp.cancelled) {
        await GrandPrix.findByIdAndUpdate(gp._id, { cancelled: true });
        console.log(`  ⛔ R${gp.round} ${gp.name}: sin raceSessionKey → no disponible`);
        cancelled++;
      }
      continue;
    }

    // Already has a result → skip result sync but backfill weather if missing
    const existing = await RaceResult.findOne({ grandPrix: gp._id }).lean();
    if (existing) {
      if (!gp.weatherCondition) {
        const wc = await fetchWeatherCondition(gp.raceSessionKey);
        if (wc) {
          await GrandPrix.findByIdAndUpdate(gp._id, { weatherCondition: wc });
          console.log(`  🌦  R${gp.round} ${gp.name}: weather → ${wc}`);
        }
      }
      alreadyDone++;
      continue;
    }

    // Fetch from OpenF1 — no position filter so we can skip DSQ/DNS drivers
    let results: OpenF1SessionResult[];
    try {
      const res = await fetch(
        `${BASE_URL}/session_result?session_key=${gp.raceSessionKey}`
      );
      if (!res.ok) {
        // Transient API error — do not cancel, retry on next seed run
        console.log(`  ⚠  R${gp.round} ${gp.name}: API error ${res.status} (se reintentará en próximo seed)`);
        skipped++;
        continue;
      }
      results = (await res.json()) as OpenF1SessionResult[];
    } catch {
      console.log(`  ⚠  R${gp.round} ${gp.name}: error de red (se reintentará en próximo seed)`);
      skipped++;
      continue;
    }

    if (results.length === 0) {
      if (!gp.cancelled) {
        await GrandPrix.findByIdAndUpdate(gp._id, { cancelled: true });
        console.log(`  ⛔ R${gp.round} ${gp.name}: sin resultados en OpenF1 → no disponible`);
        cancelled++;
      }
      continue;
    }

    // Build classified podium: sorted by position, excluding disqualified/DNS drivers
    const classified = results
      .filter((r) => !r.dsq && !r.dns)
      .sort((a, b) => a.position - b.position);

    const p1num = classified[0]?.driver_number;
    const p2num = classified[1]?.driver_number;
    const p3num = classified[2]?.driver_number;

    if (!p1num || !p2num || !p3num) {
      console.log(`  ⚠  R${gp.round} ${gp.name}: podio incompleto`);
      skipped++;
      continue;
    }

    const driverDocs = await Driver.find({
      season,
      number: { $in: [p1num, p2num, p3num] },
    })
      .select("code number")
      .lean();

    const driverByNum = new Map(driverDocs.map((d) => [d.number as number, d]));

    const p1 = driverByNum.get(p1num);
    const p2 = driverByNum.get(p2num);
    const p3 = driverByNum.get(p3num);

    if (!p1 || !p2 || !p3) {
      console.log(
        `  ⚠  R${gp.round} ${gp.name}: pilotos no encontrados (${[p1num, p2num, p3num].join(", ")})`
      );
      skipped++;
      continue;
    }

    await RaceResult.findOneAndUpdate(
      { grandPrix: gp._id },
      { p1: p1._id, p2: p2._id, p3: p3._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const wc = await fetchWeatherCondition(gp.raceSessionKey);
    await GrandPrix.findByIdAndUpdate(gp._id, {
      status: "completed",
      ...(wc ? { weatherCondition: wc } : {}),
    });

    const weatherTag = wc ? ` [${wc}]` : "";
    console.log(`  ✓  R${gp.round} ${gp.name}: P1 ${p1.code}, P2 ${p2.code}, P3 ${p3.code}${weatherTag}`);
    synced++;
  }

  const parts = [];
  if (synced) parts.push(`${synced} sincronizados`);
  if (alreadyDone) parts.push(`${alreadyDone} ya tenían resultado`);
  if (cancelled) parts.push(`${cancelled} marcados como no disponibles`);
  if (skipped) parts.push(`${skipped} omitidos (error de red, reintentar)`);
  console.log(`  → ${parts.join(", ") || "nada que hacer"}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set in environment");

  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log("Connected.");

  try {
    await seedDrivers(2026);
    await seedCalendar(2026);
    await seedPastResults(2026);
  } finally {
    await mongoose.disconnect();
    console.log("\nDone. Disconnected from MongoDB.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
