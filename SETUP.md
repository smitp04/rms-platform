# devx RMS — Setup Guide

## Prerequisites
- Node.js 20+
- Docker Desktop
- A Google Cloud project with OAuth 2.0 credentials (Workspace domain)

## 1. Clone & Install

```bash
git clone <repo>
cd devx-platform
npm install
```

## 2. Environment Setup

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
DATABASE_URL=postgresql://devx:devx_local_password@localhost:5432/devx_platform
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_DOMAIN=devxlabs.ai
WEBHOOK_SECRET=<run: openssl rand -hex 32>
REDIS_URL=redis://localhost:6379
```

**Google OAuth setup:**
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web Application)
3. Authorized origins: `http://localhost:3000`
4. Authorized redirect URIs: `http://localhost:3000/api/v1/auth/callback/google`
5. In OAuth consent screen: set Authorized domain to `devxlabs.ai`

## 3. Start Database & Redis

```bash
docker-compose up postgres redis -d
```

## 4. Run Migrations & Seed

```bash
# Generate Prisma client
cd packages/db
DATABASE_URL=postgresql://devx:devx_local_password@localhost:5432/devx_platform \
  npx prisma migrate dev --name init

# Seed (functions, roles, platforms, sprints, admin employee)
DATABASE_URL=postgresql://devx:devx_local_password@localhost:5432/devx_platform \
  npm run db:seed

cd ../..
```

## 5. Start Dev Server

```bash
npm run dev
# or just the web app:
cd apps/web && npm run dev
```

Visit http://localhost:3000

## 6. First-time Admin Setup

After seeding, update the admin employee record:
```sql
UPDATE rms_employees
SET google_id = '<your-google-id>', email = 'your@devxlabs.ai', name = 'Your Name'
WHERE email = 'admin@devxlabs.ai';
```

Or: sign in with Google, then update via Prisma Studio:
```bash
cd packages/db
DATABASE_URL=... npx prisma studio
```

## 7. n8n Webhook Configuration

**Zoho CRM (Closed Won) → RMS:**
- Trigger: Zoho CRM Deal Stage = Closed Won
- HTTP Request node: POST `https://your-domain.com/api/v1/webhooks/crm`
- Headers: `X-Webhook-Secret: <your WEBHOOK_SECRET>`
- Body (JSON):
  ```json
  {
    "zoho_deal_id": "{{Deal ID}}",
    "deal_name": "{{Deal Name}}",
    "account_name": "{{Account Name}}",
    "revenue": {{Deal Revenue}},
    "billing_model": "TIME_AND_MATERIAL",
    "devx_pillar": "AI_OPS",
    "start_date": "{{Closing Date}}",
    "project_manager_email": "{{PM Email}}",
    "growth_consultant_email": "{{Consultant Email}}"
  }
  ```

**Google Admin (New Employee) → RMS:**
- Trigger: Google Admin SDK push notification (via n8n webhook node)
- HTTP Request node: POST `https://your-domain.com/api/v1/webhooks/google-admin`
- Headers: `X-Webhook-Secret: <your WEBHOOK_SECRET>`
- Body: Google Admin SDK user object (passed through from webhook)

## Project Structure

```
devx-platform/
├── apps/web/           Next.js 14 app (frontend + API routes)
├── packages/
│   ├── db/             Prisma schema + migrations + seed
│   ├── auth/           RBAC permission definitions
│   ├── types/          Shared TypeScript types
│   └── config/         Env validation + constants
└── docker-compose.yml  Local dev services
```

## AWS Deployment

See `infrastructure/` (Phase 0 deliverable) for:
- ECS Fargate task definition
- RDS PostgreSQL config
- ElastiCache Redis config
- CloudFront + ALB setup
- GitHub Actions CI/CD pipeline
