# Resource Management System (RMS)

An enterprise internal platform for resource allocation, profitability tracking, and capacity planning — built for engineering teams.

## Monorepo Structure

```
apps/
└── web/                   Next.js 14 app (frontend + API routes)
packages/
├── db/                    Prisma schema, migrations, seed scripts
├── auth/                  RBAC helpers and role definitions
├── config/                Shared env config
└── types/                 Shared TypeScript types
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **State**: TanStack Query + Zustand
- **Auth**: NextAuth.js v5 — Google Workspace SSO (domain-restricted)
- **Database**: PostgreSQL + Prisma ORM
- **Infra**: Railway / Vercel
- **Webhooks**: Zoho CRM sync, Google Admin auto-provisioning

## Features

- **Allocation Gantt** — sprint board with 100% cap validation, bulk copy, audit trail
- **PnL Engine** — per-project revenue vs. cost, gross margin, red-flag detection (ADMIN only)
- **Sprint Engine** — bi-weekly sprints, auto-generated for the full year
- **RBAC** — ADMIN / POD_LEAD / CSM / EMPLOYEE roles with granular permission matrix
- **Audit Logs** — full JSON snapshots on every allocation change
- **Dashboard** — KPI cards, avg allocation, available bandwidth, projects at risk

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp apps/web/.env.example apps/web/.env.local

# Run DB migrations
cd packages/db && npx prisma migrate dev

# Start dev server
npm run dev
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_ALLOWED_DOMAIN=yourcompany.com
```
