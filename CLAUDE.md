# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

**Colapuntos** is a Formula 1 prediction game ("prode"). Users join private tournaments, predict the podium (P1/P2/P3) for each Grand Prix before a deadline, and earn points based on accuracy. Scores are computed per-race and accumulated on a leaderboard.

## Commands

```bash
pnpm dev          # start dev server (localhost:3000)
pnpm build        # production build + TypeScript check
pnpm seed         # populate MongoDB with drivers and calendar (requires MONGODB_URI)
```

No test runner is configured yet. TypeScript errors surface via `pnpm build`.

## Stack

- **Next.js 16** (App Router) — this is a newer version; read `node_modules/next/dist/docs/` before using APIs that may have changed
- **Tailwind CSS v4** + **shadcn/ui** (Radix-based, components in `components/ui/`)
- **MongoDB** + **Mongoose** with a cached connection (to be created at `lib/db/mongoose.ts`)
- **better-auth** — email/password auth, sessions stored in MongoDB
- **Server Actions** for all mutations; Server Components for data fetching
- **Luxon** for timezone-aware deadline calculations (always use GP timezone, never raw UTC)
- **Zod** for validation at Server Action boundaries
- **Recharts** for the points evolution chart

## Planned directory layout

```
app/
  (auth)/           # login, register — no session required
  (main)/           # session-protected routes (enforced by middleware.ts)
    dashboard/
    tournaments/[id]/
      gp/[gpId]/predict/
      gp/[gpId]/results/
      leaderboard/
    admin/[tournamentId]/
  api/auth/[...all]/ # better-auth handler
lib/
  auth.ts           # betterAuth() instance (server)
  auth-client.ts    # createAuthClient() (client)
  db/mongoose.ts    # cached Mongoose connection
  models/           # User, Tournament, GrandPrix, Driver, Prediction, RaceResult, Score
  actions/          # Server Actions: auth.actions.ts, tournament.actions.ts, prediction.actions.ts, admin.actions.ts
  scoring.ts        # pure calculateScore(prediction, result) → number
scripts/
  seed.ts           # populates DB from OpenF1 API
```

## Key domain rules

**Scoring** (per position):
- Exact P1 → 10 pts, exact P2 → 7 pts, exact P3 → 5 pts
- Driver in real podium but wrong position → 3 pts
- Miss → 0 pts

**Deadlines**: `predictionDeadline` is Friday 23:59 in the circuit's local timezone, calculated with Luxon from the Race session's `date_start` minus ~2 days. Always verify deadline server-side in Server Actions — never trust the client.

**OpenF1 API** (`https://api.openf1.org/v1`): used to seed the calendar (`/meetings`, `/sessions`), drivers (`/drivers?session_key=latest`), and race results (`/session_result?session_key={key}&position<=3`). Results are fetched once per race and persisted — never re-fetch if already in DB.

## Auth

`lib/auth.ts` exports the `betterAuth()` instance. In Server Components: `auth.api.getSession({ headers: await headers() })`. In Client Components: `useSession()` from `lib/auth-client.ts`. Env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

## Implementation plan

See `docs/PLAN.md` — checkboxes track progress stage by stage. The first unchecked item marks where to resume.
