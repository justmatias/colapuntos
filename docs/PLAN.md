# Plan de Implementación — Prode de Fórmula 1

Guía paso a paso para construir la app. Cada etapa es independiente y puede pausarse/resumirse.  
Al retomar: revisar el estado de los checkboxes y continuar desde el primer ítem sin marcar.

---

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **MongoDB** + **Mongoose** (cached connection)
- **Auth.js v5** (`next-auth@5`) — Credentials provider, JWT strategy
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

- [ ] `npx create-next-app@latest colapuntos --typescript --tailwind --app --import-alias "@/*"`
- [ ] Instalar dependencias:
  ```bash
  npm install mongoose next-auth@5 bcryptjs slugify nanoid luxon recharts zod next-themes
  npm install -D @types/bcryptjs @types/luxon tsx
  ```
- [ ] Instalar shadcn/ui: `npx shadcn@latest init`
- [ ] Agregar componentes shadcn: `npx shadcn@latest add button card badge input select dialog table dropdown-menu avatar separator skeleton toast`
- [ ] Crear `.env.local`:
  ```
  MONGODB_URI=
  AUTH_SECRET=
  AUTH_URL=http://localhost:3000
  ```
- [ ] Agregar script en `package.json`: `"seed": "tsx scripts/seed.ts"`
- [ ] Verificar que `npm run dev` levanta sin errores

---

## Etapa 2 — Base de Datos: Conexión y Modelos

- [ ] Crear `/lib/db/mongoose.ts` — conexión cacheada (evita múltiples conexiones en dev)
- [ ] Crear `/lib/models/User.ts`
- [ ] Crear `/lib/models/Tournament.ts` (con slug auto-generado e inviteCode nanoid)
- [ ] Crear `/lib/models/GrandPrix.ts` (con index compuesto `{ season, round }`)
- [ ] Crear `/lib/models/Driver.ts` (con index `{ code, season }`)
- [ ] Crear `/lib/models/Prediction.ts` (con index compuesto `{ user, tournament, grandPrix }`)
- [ ] Crear `/lib/models/RaceResult.ts`
- [ ] Crear `/lib/models/Score.ts` (con index compuesto `{ user, tournament, grandPrix }`)
- [ ] Crear `/lib/models/index.ts` — re-exporta todos los modelos

---

## Etapa 3 — Autenticación

- [ ] Crear `/lib/auth.ts` — configuración Auth.js v5 con Credentials provider + bcrypt
- [ ] Crear `/app/api/auth/[...nextauth]/route.ts` — exporta `{ handlers }`
- [ ] Crear `/middleware.ts` — protege rutas `/(main)/*`, redirige a `/login` si no hay sesión
- [ ] Crear `/lib/actions/auth.actions.ts`:
  - [ ] `registerUser(formData)` — valida con Zod, hashea password, crea User en DB
  - [ ] `loginUser(formData)` — llama `signIn` de Auth.js
- [ ] Crear `/app/(auth)/login/page.tsx` + `LoginForm` component
- [ ] Crear `/app/(auth)/register/page.tsx` + `RegisterForm` component
- [ ] Probar registro + login + logout

---

## Etapa 4 — Sistema de Puntuación

- [ ] Crear `/lib/scoring.ts` — función pura `calculateScore(prediction, result)`
  - P1 exacto → 10 pts
  - P2 exacto → 7 pts
  - P3 exacto → 5 pts
  - Piloto en podio real pero mal posición → 3 pts
  - No acertó → 0 pts
- [ ] Implementar `recalculateScoresForGP(grandPrixId)` — upsert masivo de Score documents
- [ ] Escribir tests unitarios de `calculateScore` (casos límite: podio desordenado, ninguno acierta, todos exactos)

---

## Etapa 5 — Seed de Datos

- [ ] Crear `/scripts/seed.ts`
- [ ] Cargar pilotos activos 2025 con equipos y códigos:
  - VER/Verstappen/Red Bull, NOR/Norris/McLaren, LEC/Leclerc/Ferrari, HAM/Hamilton/Ferrari,
    RUS/Russell/Mercedes, SAI/Sainz/Williams, PIA/Piastri/McLaren, ALO/Alonso/Aston Martin,
    STR/Stroll/Aston Martin, GAS/Gasly/Alpine, OCO/Ocon/Alpine, HUL/Hulkenberg/Sauber,
    TSU/Tsunoda/RB, LAW/Lawson/RB, ALB/Albon/Williams, MAG/Magnussen/Haas, BEA/Bearman/Haas,
    BOT/Bottas/Sauber, ZHO/Zhou/Sauber, COL/Colapinto (según grilla final)
- [ ] Cargar calendario F1 2025 completo con:
  - Nombre del GP, país, circuito, ronda, fechas (race + qualifying + sprint si aplica)
  - Timezone del circuito (ej: `"Europe/Monaco"`, `"America/Sao_Paulo"`)
  - `predictionDeadline` calculado con luxon: viernes anterior a la carrera, 23:59 hora local
- [ ] Cargar calendario F1 2026 provisional
- [ ] `npm run seed` — verificar en MongoDB que los datos están correctos

---

## Etapa 6 — Flujo Core: Torneos

- [ ] Crear `/lib/actions/tournament.actions.ts`:
  - [ ] `createTournament(name, season)` — genera slug + inviteCode, agrega creador a members
  - [ ] `joinTournament(inviteCode)` — busca torneo, agrega usuario a members (error si ya está)
  - [ ] `regenerateInviteCode(tournamentId)` — solo creador
- [ ] Crear `/app/(main)/layout.tsx` — sidebar/navbar con navegación y user avatar
- [ ] Crear `/app/(main)/dashboard/page.tsx`:
  - Lista de torneos del usuario con puntos acumulados
  - Banner de alerta si hay GP con deadline en las próximas 48hs
- [ ] Crear `/app/(main)/tournaments/new/page.tsx` — formulario crear torneo
- [ ] Crear `/app/(main)/tournaments/join/page.tsx` — formulario ingresar inviteCode
- [ ] Crear `/app/(main)/tournaments/[id]/page.tsx`:
  - Tabla de posiciones del torneo
  - Calendario de GPs con estado (✅ completado, 🔒 cerrado, 🟢 abierto, ⏳ futuro)
  - Acceso rápido al próximo GP
- [ ] Probar flujo: crear torneo → copiar inviteCode → segundo usuario → unirse → ver dashboard

---

## Etapa 7 — Flujo Core: Predicciones

- [ ] Crear `/lib/actions/prediction.actions.ts`:
  - [ ] `savePrediction(tournamentId, gpId, p1, p2, p3)`:
    - Verifica deadline server-side (luxon + timezone del GP)
    - Verifica que p1/p2/p3 son distintos
    - Upsert de Prediction
- [ ] Crear `/app/(main)/tournaments/[id]/gp/[gpId]/predict/page.tsx`:
  - `PodiumSelector`: 3 dropdowns con pilotos activos de la temporada
  - Validación client: mismo piloto no puede repetirse
  - Post-deadline: read-only con countdown y mensaje "predicciones cerradas"
  - Muestra predicción guardada si ya existe
- [ ] Crear `/app/(main)/tournaments/[id]/gp/[gpId]/results/page.tsx`:
  - Pre-deadline: solo muestra predicción propia + mensaje de revelación con countdown
  - Post-deadline: tabla con todas las predicciones del grupo + color coding si hay resultado
- [ ] Probar: predicción válida, predicción post-deadline (bloqueada), pilotos duplicados (bloqueado)

---

## Etapa 8 — Admin: Cargar Resultados

- [ ] Crear `/lib/actions/admin.actions.ts`:
  - [ ] `saveRaceResult(gpId, p1, p2, p3)`:
    - Verifica que el usuario es creador del torneo
    - Upsert RaceResult
    - Llama `recalculateScoresForGP(gpId)`
    - Actualiza GP status a `'completed'`
  - [ ] `removeParticipant(tournamentId, userId)`
- [ ] Crear `/app/(main)/admin/[tournamentId]/page.tsx`:
  - `ResultsForm`: select de GP + 3 selects de pilotos
  - Lista de participantes con opción de eliminar
  - Regenerar código de invitación
  - Acceso restringido server-side: solo creador del torneo
- [ ] Probar: cargar resultado → verificar recálculo de scores → ver leaderboard actualizado
- [ ] Probar: editar resultado → verificar recálculo correcto

---

## Etapa 9 — Leaderboard

- [ ] Crear `/app/(main)/tournaments/[id]/leaderboard/page.tsx`:
  - Tabla principal: Posición | Usuario | Pts Totales | GPs Predichos | Promedio/GP | Mejor GP | Peor GP
  - Desglose expandible por GP (accordion)
  - Gráfico de evolución de puntos con Recharts (`LineChart`, una línea por usuario)
  - Head-to-head: selector de dos usuarios para comparativa directa
- [ ] Crear queries eficientes con `lean()` y aggregation pipeline para el leaderboard

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
- **Auth.js v5**: usa `AUTH_SECRET` (no `NEXTAUTH_SECRET`) y `auth()` en lugar de `getServerSession()`
- **Timezone deadlines**: siempre usar luxon con la timezone del GP, nunca UTC directo
