# Plan de Implementación — Prode de Fórmula 1

Guía paso a paso para construir la app. Cada etapa es independiente y puede pausarse/resumirse.  
Al retomar: revisar el estado de los checkboxes y continuar desde el primer ítem sin marcar.

---

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **MongoDB** + **Mongoose** (cached connection)
- **better-auth** — Email/password provider, sesiones en MongoDB
- **Server Actions** para mutaciones; Server Components para data fetching
- **Luxon** para manejo de timezones en deadlines
- **Recharts** para gráfico de evolución de puntos
- **Zod** para validación

## Fuente de Datos: OpenF1 API

Usar la API pública de OpenF1 (https://api.openf1.org) como fuente de datos para pilotos, calendario y resultados.
Datos históricos (2023+) son gratuitos y no requieren autenticación.
Base URL: https://api.openf1.org/v1

### Endpoints a consumir:

1. **Calendario (Meetings)**
   GET /v1/meetings?year={season}
   Retorna: meeting_key, meeting_name, country_name, country_code, country_flag, circuit_short_name, circuit_image, circuit_type, location, date_start, date_end, gmt_offset, is_cancelled

2. **Sesiones**
   GET /v1/sessions?year={season}
   Retorna: session_key, session_name, session_type, meeting_key, date_start, date_end, circuit_short_name, country_name, gmt_offset
   → Filtrar por session_type="Race" para obtener la session_key de cada carrera
   → Usar date_start de la sesión "Race" para calcular la deadline de predicciones (viernes 23:59 hora local = date_start de la Race menos ~2 días, ajustado con gmt_offset)

3. **Pilotos**
   GET /v1/drivers?session_key={latest_session_key}
   Retorna: driver_number, first_name, last_name, full_name, name_acronym, team_name, team_colour, headshot_url
   → Usar session_key=latest o la session_key de la primera sesión de la temporada

4. **Resultados de carrera (Podio)**
   GET /v1/session_result?session_key={race_session_key}&position<=3
   Retorna: driver_number, position, dnf, dns, dsq, duration, gap_to_leader
   → Esto da directamente P1, P2, P3 para calcular los puntos del prode

### Estrategia de sincronización:

- **Seed inicial**: Script `npm run seed` que consume /meetings y /sessions para el año actual y pobla MongoDB con el calendario. Consume /drivers para cargar los pilotos.
- **Sync de pilotos**: Los pilotos pueden cambiar entre sesiones (reemplazos mid-season). Implementar un botón de admin o cron que re-sincronice pilotos desde la API.
- **Carga automática de resultados**: Implementar una función/endpoint `syncRaceResult(meetingKey)` que:
  1. Busca la session_key de tipo "Race" para ese meeting
  2. Consulta /session_result para obtener el podio
  3. Cruza driver_number con los pilotos en MongoDB
  4. Guarda el resultado y recalcula todos los scores
     → Esto puede ser un botón en el panel de admin ("Sincronizar resultado") o un cron que corra cada lunes
- **Fallback manual**: Mantener siempre la opción de que el admin cargue/edite resultados manualmente, por si la API falla o tarda.

### Caché y rate limiting:

- Cachear las respuestas de meetings y sessions en MongoDB (no cambian frecuentemente)
- Los datos de pilotos se actualizan al inicio de la temporada y ante cambios mid-season
- Los resultados se consultan una sola vez por carrera y se persisten en la DB
- No hacer requests innecesarios: verificar si el resultado ya existe antes de consultar la API

### Datos a guardar en MongoDB (enriquecidos desde la API):

En el modelo GrandPrix, guardar:

- meeting_key y race_session_key (para futuras consultas a la API)
- country_flag y circuit_image (URLs de la API, para mostrar en la UI)
- gmt_offset (para calcular deadlines correctamente)

En el modelo Driver, guardar:

- driver_number (es el identificador principal en OpenF1)
- headshot_url, team_colour (para la UI)

---

## Etapa 1 — Bootstrap del Proyecto

- [x] `npx create-next-app@latest . --typescript --tailwind --app --import-alias "@/*"` (se usó `.` porque el directorio ya existía)
- [x] Instalar dependencias con pnpm:
  ```bash
  pnpm add mongoose better-auth bcryptjs slugify nanoid luxon recharts zod next-themes
  pnpm add -D @types/bcryptjs @types/luxon tsx
  ```
- [x] Instalar shadcn/ui: `npx shadcn@latest init -d`
- [x] Agregar componentes shadcn: `npx shadcn@latest add card badge input select dialog table dropdown-menu avatar separator skeleton sonner`
  > Nota: `toast` está deprecado en shadcn — se usa `sonner` en su lugar.
- [x] Crear `.env.local`:
  ```
  MONGODB_URI=
  BETTER_AUTH_SECRET=
  BETTER_AUTH_URL=http://localhost:3000
  ```
- [x] Agregar script en `package.json`: `"seed": "tsx scripts/seed.ts"`
- [x] Verificar build sin errores: `pnpm run build` ✓

---

## Etapa 2 — Base de Datos: Conexión y Modelos

- [x] Crear `/lib/db/mongoose.ts` — conexión cacheada (evita múltiples conexiones en dev)
- [x] Crear `/lib/models/User.ts`
- [x] Crear `/lib/models/Tournament.ts` (con slug auto-generado e inviteCode nanoid)
- [x] Crear `/lib/models/GrandPrix.ts` (con index compuesto `{ season, round }`)
- [x] Crear `/lib/models/Driver.ts` (con index `{ code, season }`)
- [x] Crear `/lib/models/Prediction.ts` (con index compuesto `{ user, tournament, grandPrix }`)
- [x] Crear `/lib/models/RaceResult.ts`
- [x] Crear `/lib/models/Score.ts` (con index compuesto `{ user, tournament, grandPrix }`)
- [x] Crear `/lib/models/index.ts` — re-exporta todos los modelos

---

## Etapa 3 — Autenticación

- [x] Crear `/lib/auth.ts` — instancia de `betterAuth` con plugin `emailAndPassword`, adapter MongoDB
- [x] Crear `/lib/auth-client.ts` — `createAuthClient()` para usar en Client Components
- [x] Crear `/app/api/auth/[...all]/route.ts` — exporta `{ GET, POST }` desde `auth.handler`
- [x] Crear `/proxy.ts` — protege rutas `/(main)/*`, redirige a `/login` si no hay sesión (Next.js 16: proxy en lugar de middleware)
- [x] Crear `/lib/actions/auth.actions.ts`:
  - [x] `registerUser(formData)` — valida con Zod, llama `auth.api.signUpEmail`
  - [x] `loginUser(formData)` — llama `auth.api.signInEmail`
- [x] Crear `/app/(auth)/login/page.tsx` + `LoginForm` component
- [x] Crear `/app/(auth)/register/page.tsx` + `RegisterForm` component
- [x] Probar registro + login + logout

---

## Etapa 4 — Sistema de Puntuación

- [x] Crear `/lib/scoring.ts` — función pura `calculateScore(prediction, result)`
  - P1 exacto → 10 pts
  - P2 exacto → 7 pts
  - P3 exacto → 5 pts
  - Piloto en podio real pero mal posición → 3 pts
  - No acertó → 0 pts
- [x] Implementar `recalculateScoresForGP(grandPrixId)` en `lib/actions/scoring.actions.ts` — upsert masivo de Score documents
- [x] Escribir tests unitarios de `calculateScore` (casos límite: podio desordenado, ninguno acierta, todos exactos)

---

## Etapa 5 — Seed de Datos

- [x] Crear `/scripts/seed.ts`
- [x] Cargar pilotos activos 2025 con equipos y códigos (via OpenF1 API `/drivers?session_key=latest`)
- [x] Cargar calendario F1 2025 completo con:
  - Nombre del GP, país, circuito, ronda, fechas (race + qualifying + sprint si aplica)
  - Timezone del circuito (ej: `"Europe/Monaco"`, `"America/Sao_Paulo"`)
  - `predictionDeadline` calculado con luxon: viernes anterior a la carrera, 23:59 hora local
- [x] Cargar calendario F1 2026 provisional (hardcodeado, 24 carreras)
- [ ] `npm run seed` — verificar en MongoDB que los datos están correctos (requiere `.env` con MONGODB_URI)

---

## Etapa 6 — Flujo Core: Torneos

- [x] Crear `/lib/actions/tournament.actions.ts`:
  - [x] `createTournament(name, season)` — genera slug + inviteCode, agrega creador a members
  - [x] `joinTournament(inviteCode)` — busca torneo, agrega usuario a members (error si ya está)
  - [x] `regenerateInviteCode(tournamentId)` — solo creador
- [x] Crear `/app/(main)/layout.tsx` — navbar con logo, navegación y user avatar dropdown
- [x] Crear `/app/(main)/dashboard/page.tsx`:
  - Lista de torneos del usuario con puntos acumulados
  - Banner de alerta si hay GP con deadline en las próximas 48hs
- [x] Crear `/app/(main)/tournaments/new/page.tsx` — formulario crear torneo
- [x] Crear `/app/(main)/tournaments/join/page.tsx` — formulario ingresar inviteCode
- [x] Crear `/app/(main)/tournaments/[id]/page.tsx`:
  - Tabla de posiciones del torneo
  - Calendario de GPs con estado (✅ completado, 🔒 cerrado, 🟢 abierto, ⏳ futuro)
  - Acceso rápido al próximo GP
- [ ] Probar flujo: crear torneo → copiar inviteCode → segundo usuario → unirse → ver dashboard

---

## Etapa 7 — Flujo Core: Predicciones

- [x] Crear `/lib/actions/prediction.actions.ts`:
  - [x] `savePrediction(tournamentId, gpId, p1, p2, p3)`:
    - Verifica deadline server-side (luxon + timezone del GP)
    - Verifica que p1/p2/p3 son distintos
    - Upsert de Prediction
- [x] Crear `/app/(main)/tournaments/[id]/gp/[gpId]/predict/page.tsx`:
  - `PodiumSelector`: 3 dropdowns con pilotos activos de la temporada
  - Validación client: mismo piloto no puede repetirse
  - Post-deadline: read-only con countdown y mensaje "predicciones cerradas"
  - Muestra predicción guardada si ya existe
- [x] Crear `/app/(main)/tournaments/[id]/gp/[gpId]/results/page.tsx`:
  - Pre-deadline: solo muestra predicción propia + mensaje de revelación con countdown
  - Post-deadline: tabla con todas las predicciones del grupo + color coding si hay resultado
- [ ] Probar: predicción válida, predicción post-deadline (bloqueada), pilotos duplicados (bloqueado)

---

## Etapa 8 — Admin: Cargar Resultados

- [x] Crear `/lib/actions/admin.actions.ts`:
  - Solo se puede cargar retroactivamente resultados de carreras pasadas
  - [x] `saveRaceResult(gpId, p1, p2, p3)`:
    - Verifica que el usuario es creador del torneo
    - Upsert RaceResult
    - Llama `recalculateScoresForGP(gpId)`
    - Actualiza GP status a `'completed'`
  - [x] `removeParticipant(tournamentId, userId)`
- [x] Crear `/app/(main)/admin/[tournamentId]/page.tsx`:
  - `ResultsForm`: select de GP + 3 selects de pilotos
  - Lista de participantes con opción de eliminar
  - Regenerar código de invitación
  - Acceso restringido server-side: solo creador del torneo
- [ ] Probar: cargar resultado → verificar recálculo de scores → ver leaderboard actualizado
- [ ] Probar: editar resultado → verificar recálculo correcto

---

## Etapa 9 — Leaderboard

- [x] Crear `/app/(main)/tournaments/[id]/leaderboard/page.tsx`:
  - Tabla principal: Posición | Usuario | Pts Totales | GPs Predichos | Promedio/GP | Mejor GP | Peor GP
  - Desglose expandible por GP (accordion)
  - Gráfico de evolución de puntos con Recharts (`LineChart`, una línea por usuario)
  - Head-to-head: selector de dos usuarios para comparativa directa
  - Enlace para compartir el leaderboard en una URL pública con parms tournamentId y userId (no logueado)
- [x] Crear queries eficientes con `lean()` y aggregation pipeline para el leaderboard

---

## Etapa 10 — Calendario y Perfil

- [ ] Crear `/app/(main)/calendar/page.tsx`:
  - Grilla de todos los GPs de la temporada
  - Banderas de países (emoji), fechas, circuitos
  - Estado visual + countdown al próximo GP
- [ ] Crear `/app/(main)/profile/page.tsx`:
  - Editar nombre e imagen
  - Estadísticas personales: % aciertos exactos, piloto más predicho, racha actual

---

## Etapa 11 — Features Adicionales

- [ ] **Modo oscuro/claro**: instalar `next-themes`, agregar toggle en navbar
- [ ] **Achievements** (`/lib/achievements.ts`):
  - "Oráculo": 3 GPs consecutivos con los 3 puestos exactos
  - "Suertudo": 22 puntos en un GP
  - "Consistente": puntos en N GPs seguidos
  - Calcular y mostrar en perfil
- [ ] **Compartir vía WhatsApp**: botón post-deadline que genera URL `https://wa.me/?text=...`
- [ ] **Banner de recordatorio**: 48hs antes de deadline, mostrar en dashboard y en predicción

---

## Etapa 12 — Calidad y Deploy

- [ ] `npm run build` — resolver todos los errores TypeScript y ESLint
- [ ] Revisar loading states en Server Components (suspense boundaries)
- [ ] Revisar error handling en Server Actions (try/catch + mensajes de error al usuario)
- [ ] Optimistic updates en formulario de predicción
- [ ] Probar en mobile (responsive)
- [ ] Configurar variables de entorno en Vercel
- [ ] Deploy a Vercel conectado a MongoDB Atlas
- [ ] Smoke test en producción: registro → torneo → predicción → resultado → leaderboard

---

## Notas para Retomar

- **Estado del proyecto**: ver checkboxes arriba, el primer ítem sin marcar indica dónde continuar
- **Variables de entorno**: `.env.local` no está en git, hay que recrearlo
- **Seed**: si la DB está vacía, correr `npm run seed` antes de probar
- **better-auth**: usa `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`; en Server Components usar `auth.api.getSession({ headers: await headers() })`; en Client Components usar el hook `useSession()` del auth-client
- **Timezone deadlines**: siempre usar luxon con la timezone del GP, nunca UTC directo
