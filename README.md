# Resource Management System (RMS)

An enterprise internal platform for resource allocation, profitability tracking, and capacity planning — built for engineering teams.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **State**: TanStack Query + Zustand
- **Auth**: NextAuth.js v5 — Google Workspace SSO (domain-restricted)
- **Database**: PostgreSQL (AWS RDS) + Prisma ORM
- **Cache**: Redis (ElastiCache)
- **Infra**: AWS ECS Fargate, S3, CloudWatch
- **CI/CD**: GitHub Actions → ECR → ECS
- **Webhooks**: n8n (Zoho CRM sync, Google Admin auto-provisioning)

## Features

- **Allocation Gantt** — drag-and-drop sprint board (dnd-kit), 100% cap validation, bulk copy, audit trail
- **PnL Engine** — per-project revenue vs. cost, gross margin, red-flag detection (ADMIN only)
- **Sprint Engine** — bi-weekly sprints, auto-generated for the full year
- **RBAC** — ADMIN / POD_LEAD / CSM / EMPLOYEE roles with granular permission matrix
- **Audit Logs** — full JSON snapshots (old + new state) on every allocation change
- **Dashboard** — KPI cards, avg allocation, available bandwidth, projects at risk
- **Webhooks** — Zoho CRM deal closed → auto-creates project; Google Admin → auto-provisions employee

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          Google SSO login
│   ├── (dashboard)/
│   │   ├── employees/         Employee directory
│   │   ├── projects/          Project management
│   │   ├── allocations/       Gantt board
│   │   └── pnl/               P&L overview
│   └── api/v1/                REST API routes
├── components/
│   ├── layout/                Sidebar, Topbar
│   ├── allocations/           Gantt + modals
│   ├── employees/             Directory + profile drawer
│   ├── projects/              Project list + detail
│   └── pnl/                   PnL charts
├── lib/
│   ├── auth.ts                NextAuth config + requireSession()
│   ├── prisma.ts              Prisma singleton
│   └── services/              Business logic layer
prisma/
└── schema.prisma              Full DB schema (rms_ namespace)
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local

# Run DB migrations
npx prisma migrate dev

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
REDIS_URL=redis://...
```
