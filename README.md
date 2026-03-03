# bbb-ct-chatbot-leads

Production-ready monorepo for BBB Serving Connecticut lead intake:
- Public chatbot at `/`
- Admin dashboard at `/admin`
- Privacy policy at `/privacy`
- Privacy request workflow at `/privacy-request`

## Stack

- Frontend: React + TypeScript + Tailwind + Framer Motion (`apps/web`)
- Backend: Express + TypeScript (`apps/api`)
- Database: Postgres + Drizzle ORM (`packages/db`)
- Shared contracts/flows: Zod + TypeScript (`packages/shared`)
- Workspace tooling: pnpm workspaces

## Monorepo Layout

- `apps/web` React SPA (chatbot, admin, privacy pages)
- `apps/api` Express API + static web serving in production
- `packages/db` Drizzle schema + migrations
- `packages/shared` Shared Zod schemas + deterministic flow definitions

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Optional (required in production privacy-email flow):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Exact Local Commands

1. Install dependencies:

```bash
pnpm install
```

2. Start Postgres with Docker Compose:

```bash
docker compose up -d postgres
```

3. Use this local database URL in `.env`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/bbb_ct_chatbot
```

4. Run the full dev stack:

```bash
pnpm dev
```

This will:
- build shared packages
- run DB migrations
- start API (`http://localhost:4000`)
- start web (`http://localhost:5173`)

## Database Commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Build, Test, Start

```bash
pnpm build
pnpm test
pnpm start
```

`pnpm start` runs migrations, then starts the API which serves built web assets (`apps/web/dist`) for single-service deployment.

## Security Features Implemented

- API rate limit: 100 requests/min/IP (`/api/*`)
- Helmet headers with CSP + HSTS (production)
- Request body size limit: 1MB
- Input sanitization (trim + strip control chars)
- Pino logging with production redaction for request bodies, tokens, auth headers, cookies
- Same-origin API usage by default (no permissive CORS)

## Render Deploy

Recommended for this stack because Render supports:
- managed Postgres
- single web service deployment
- simple Blueprint (`render.yaml`) provisioning

### Build and start commands

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate
```

Start command:

```bash
pnpm start
```

### Required env vars

- `DATABASE_URL`
- `NODE_ENV=production`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PUBLIC_APP_URL`

### One-click / Blueprint deploy

1. Push this repo to GitHub.
2. In Render, choose **New > Blueprint**.
3. Select this repo.
4. Render reads `render.yaml` and provisions:
   - web service
   - managed Postgres
5. Set required env vars in Render dashboard:
   - `DATABASE_URL` (auto-injected from managed Postgres when using Blueprint)
   - `NODE_ENV=production`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `PUBLIC_APP_URL`
6. Optional production email env vars:
   - `SMTP_*` (required for production privacy verification email flow)
7. Deploy.

Health endpoint:
- `/api/health`

## Railway Deployment (Alternative)

1. Create a new Railway project from this repo.
2. Add a Postgres service in Railway.
3. Set env vars on the app service:
   - `DATABASE_URL` (from Railway Postgres)
   - `NODE_ENV=production`
   - `PUBLIC_APP_URL=https://<your-railway-domain>`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - optional `SMTP_*` for privacy verification emails
4. Build command:

```bash
pnpm install --frozen-lockfile && pnpm build
```

5. Start command:

```bash
pnpm start
```

6. Expose the service publicly.

## API Overview

Public:
- `GET /api/health`
- `POST /api/leads/start`
- `POST /api/leads/:id/answer`
- `POST /api/leads/:id/complete`
- `POST /api/privacy/request`
- `GET /api/privacy/verify?token=...`
- `GET /api/privacy/download?token=...`

Admin:
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/stats`
- `GET /api/admin/leads`
- `GET /api/admin/leads/:id`
- `GET /api/admin/export.csv`
- `POST /api/admin/jobs/mark-abandoned`

## Notes

- Leads are created with `in_progress` status when started.
- `last_step_key` and `updated_at` track abandonment points.
- Admin UI marks leads as abandoned in real time when `in_progress` and stale >30 minutes.
- Nightly/cron endpoint marks `abandoned_at` for stale >7 days.
- In dev, privacy verification links are logged; in production, SMTP email delivery is required.
