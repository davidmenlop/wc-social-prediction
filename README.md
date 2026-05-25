# World Cup Social Prediction

Implementacion inicial del MVP en 5 dias.

## Estructura

- `apps/web`: frontend Next.js (mobile-first)
- `supabase/migrations`: esquema inicial de base de datos y politicas RLS
- `world-cup-social-prediction-platform-mvp.md`: documento funcional original

## Requisitos

- Node.js 20+
- Cuenta de Supabase
- (Opcional MVP+) n8n y proveedor WhatsApp API

## Inicio rapido

1. Crear proyecto Supabase y obtener URL y anon key.
2. Copiar `apps/web/.env.example` a `apps/web/.env.local`.
3. Completar variables de entorno.
4. Ejecutar frontend:

```bash
cd apps/web
npm install
npm run dev
```

## Credenciales necesarias

Frontend (publicas):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_WHATSAPP_NUMBER`

Servidor (privadas):

- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_API_TOKEN`

WhatsApp automatico (opcional en MVP inicial):

- `WHATSAPP_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

Resultados de partidos con API-Football:

- `FOOTBALL_API_BASE_URL`
- `FOOTBALL_API_KEY`
- `FOOTBALL_DEFAULT_LEAGUE_ID`
- `FOOTBALL_DEFAULT_SEASON`
- `FOOTBALL_DEFAULT_TIMEZONE`

## Endpoints de soporte

- `GET /api/health/credentials`: verifica variables cargadas (sin exponer secretos).
- `GET /api/cron/notify-winners`: endpoint para cron seguro con `Authorization: Bearer <INTERNAL_API_TOKEN>`.
- `POST /api/admin/notify-winners`: reintento manual seguro con `Authorization: Bearer <INTERNAL_API_TOKEN>`.
- `GET /api/cron/sync-results`: sincroniza resultados por fecha/liga y luego notifica ganadores.
- `POST /api/admin/sync-results`: ejecucion manual de sincronizacion de resultados.
- `POST /api/admin/notify-join-request`: notifica a admins cuando entra una solicitud de acceso (`requestId`).
- `POST /api/admin/notify-join-decision`: notifica al usuario cuando su solicitud fue aprobada/rechazada (`requestId`).
- `POST /api/admin/submit-join-request`: crea solicitud pendiente y dispara notificacion a admins.
- `POST /api/admin/process-join-request`: aprueba/rechaza solicitud, agrega miembro si aplica y notifica decision.
- `GET /api/cron/remind-predictions`: envia recordatorios de prediccion para partidos proximos (`minutes` opcional).
- `POST /api/admin/remind-predictions`: ejecucion manual de recordatorios (`minutes` opcional).

Parametros opcionales de sync:

- query/body `date=YYYY-MM-DD` para reprocesar una fecha especifica.

## Prueba manual de notificaciones

1. Cargar resultados en `matches` (`ended=true`, goles completos).
2. Verificar que existan predicciones con puntos en `predictions`.
3. Ejecutar `POST /api/admin/notify-winners` con token interno.
4. Confirmar que `matches.notified_at` quede poblado.

## Cuándo se usa cada notificacion WhatsApp

- Join request: cuando un usuario solicita acceso a un grupo con aprobacion.
- Join decision: cuando el admin aprueba o rechaza una solicitud.
- Prediction reminder: cuando faltan pocos minutos para el kickoff y el usuario aun no envio pronostico.
- Winner notification: cuando termina un partido y se calculan puntos.

## Flujo approval end-to-end (backend)

1. `POST /api/admin/submit-join-request` con `groupId`, `requestedBy` y opcional `requestedName`/`requestedPhone`.
2. Admin revisa solicitud en estado `pending`.
3. `POST /api/admin/process-join-request` con `requestId` y `status` (`approved` o `rejected`).
4. Si se aprueba, se crea/actualiza membership en `group_members`.
5. Se dispara WhatsApp al usuario con el resultado de la decision.

## Prueba manual de sincronizacion de resultados

1. Ejecutar migracion `supabase/migrations/20260525233000_api_football_sync.sql`.
2. Ejecutar migracion `supabase/migrations/20260526001000_join_request_snapshot.sql`.
3. Asegurar que los partidos en `matches` tengan `external_fixture_id`.
4. Ejecutar `GET /api/cron/sync-results` con token interno.
5. Verificar actualizacion de `status_short`, `home_goals`, `away_goals`, `ended` y `api_sync_at`.

## Alcance implementado en este arranque

- Base Next.js + Tailwind + TypeScript
- Pantalla operativa inicial para flujos MVP (grupos, predicciones, ranking, comunicaciones)
- Esquema SQL inicial para grupos, miembros, partidos, predicciones y estados de notificacion

## Siguiente paso tecnico

Aplicar migracion en Supabase y conectar la UI a consultas reales con `@supabase/supabase-js`.
