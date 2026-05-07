const BASE_URL = "https://api.openf1.org/v1";

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  country_name: string;
  country_code: string;
  country_flag?: string;
  circuit_short_name: string;
  circuit_image?: string;
  location: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  is_cancelled: boolean;
}

export interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  is_cancelled?: boolean;
}

export interface OpenF1SessionResult {
  position: number;
  driver_number: number;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
}

export interface OpenF1Driver {
  driver_number: number;
  first_name: string;
  last_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour?: string;
  headshot_url?: string;
}

// Serialize OpenF1 requests with a minimum 2-second gap between them.
// On 429 (rate-limit), wait 2 minutes before retrying.
const MIN_REQUEST_GAP_MS = 2_000;
const RATE_LIMIT_BACKOFF_MS = 120_000;

let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
  const next = requestChain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  requestChain = next.catch(() => undefined);
  return next;
}

async function fetchWithRetry(url: string, retries = 3, delay = 500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await scheduleRequest(() => fetch(url));
    if (res.ok) return res;
    if (i < retries - 1) {
      const wait = res.status === 429 ? RATE_LIMIT_BACKOFF_MS : delay;
      if (res.status === 429) {
        console.log(`    ⏸ Rate limit alcanzado en OpenF1 — esperando 2 min…`);
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return scheduleRequest(() => fetch(url));
}

export async function fetchOpenF1<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`OpenF1 ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchMeetings(year: number): Promise<OpenF1Meeting[]> {
  return fetchOpenF1<OpenF1Meeting[]>(`/meetings?year=${year}`);
}

export async function fetchMeetingByKey(meetingKey: number): Promise<OpenF1Meeting | null> {
  const res = await fetchOpenF1<OpenF1Meeting[]>(`/meetings?meeting_key=${meetingKey}`);
  return res[0] ?? null;
}

export async function fetchSessionsForYear(year: number): Promise<OpenF1Session[]> {
  return fetchOpenF1<OpenF1Session[]>(`/sessions?year=${year}`);
}

export async function fetchSessionsForMeeting(meetingKey: number): Promise<OpenF1Session[]> {
  return fetchOpenF1<OpenF1Session[]>(`/sessions?meeting_key=${meetingKey}`);
}

export async function fetchSessionByKey(sessionKey: number): Promise<OpenF1Session | null> {
  const res = await fetchOpenF1<OpenF1Session[]>(`/sessions?session_key=${sessionKey}`);
  return res[0] ?? null;
}

export async function fetchSessionResults(sessionKey: number): Promise<OpenF1SessionResult[]> {
  const res = await fetchWithRetry(`${BASE_URL}/session_result?session_key=${sessionKey}`);
  if (!res.ok) throw new Error(`OpenF1 session_result → ${res.status} for session ${sessionKey}`);
  return res.json() as Promise<OpenF1SessionResult[]>;
}

export async function fetchDriverForSession(
  driverNumber: number,
  sessionKey: number
): Promise<OpenF1Driver | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithRetry(
        `${BASE_URL}/drivers?driver_number=${driverNumber}&session_key=${sessionKey}`,
        1,
        0
      );
      if (!res.ok) {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        return null;
      }
      const drivers = (await res.json()) as OpenF1Driver[];
      if (drivers[0]?.name_acronym) return drivers[0];
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  return null;
}

export async function fetchDriversForSession(sessionKey: number): Promise<OpenF1Driver[]> {
  return fetchOpenF1<OpenF1Driver[]>(`/drivers?session_key=${sessionKey}`);
}

export async function fetchWeather(sessionKey: number): Promise<{ rainfall: number }[]> {
  return fetchOpenF1<{ rainfall: number }[]>(`/weather?session_key=${sessionKey}`);
}
