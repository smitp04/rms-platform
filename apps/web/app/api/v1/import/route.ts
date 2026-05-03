import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

// POST /api/v1/import
// Body: { type: 'employees' | 'projects', rows: Record<string, unknown>[] }
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'employee:write')) {
      throw new ApiError(403, 'Only admins can bulk import');
    }

    const body = await req.json();
    const { type, rows } = body as {
      type: 'employees' | 'projects';
      rows: Record<string, unknown>[];
    };

    if (!['employees', 'projects'].includes(type)) {
      throw new ApiError(400, 'type must be employees or projects');
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ApiError(400, 'rows must be a non-empty array');
    }

    if (type === 'employees') {
      return apiSuccess(await importEmployees(rows));
    } else {
      return apiSuccess(await importProjects(rows));
    }
  } catch (err) {
    return apiError(err);
  }
}

// ── Employee import ────────────────────────────────────────────────────────────
// Expected columns: name, email, function, role, pod (optional), platforms (comma-sep optional)
async function importEmployees(rows: Record<string, unknown>[]) {
  const results: { row: number; status: 'created' | 'updated' | 'error'; message: string }[] = [];

  // Pre-fetch lookup tables
  const allFunctions = await prisma.functions.findMany();
  const allRoles = await prisma.roles.findMany({ include: { function: true } });
  const allPods = await prisma.pods.findMany();
  const allPlatforms = await prisma.platforms.findMany();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header
    try {
      const name = String(row['name'] ?? '').trim();
      const email = String(row['email'] ?? '').trim().toLowerCase();
      const functionName = String(row['function'] ?? '').trim();
      const roleName = String(row['role'] ?? '').trim();
      const podName = String(row['pod'] ?? '').trim();
      const platformNames = String(row['platforms'] ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      // Validate required
      const missing: string[] = [];
      if (!name) missing.push('name');
      if (!email) missing.push('email');
      if (!functionName) missing.push('function');
      if (!roleName) missing.push('role');
      if (missing.length) {
        results.push({ row: rowNum, status: 'error', message: `Missing: ${missing.join(', ')}` });
        continue;
      }

      // Resolve function
      const fn = allFunctions.find((f) => f.name.toLowerCase() === functionName.toLowerCase());
      if (!fn) {
        results.push({
          row: rowNum,
          status: 'error',
          message: `Function "${functionName}" not found. Valid: ${allFunctions.map((f) => f.name).join(', ')}`,
        });
        continue;
      }

      // Resolve role
      const role = allRoles.find(
        (r) =>
          r.name.toLowerCase() === roleName.toLowerCase() &&
          r.function_id === fn.id
      );
      if (!role) {
        results.push({
          row: rowNum,
          status: 'error',
          message: `Role "${roleName}" not found under function "${functionName}".`,
        });
        continue;
      }

      // Resolve optional pod
      const pod = podName
        ? allPods.find((p) => p.name.toLowerCase() === podName.toLowerCase())
        : null;
      if (podName && !pod) {
        results.push({
          row: rowNum,
          status: 'error',
          message: `Pod "${podName}" not found. Valid: ${allPods.map((p) => p.name).join(', ')}`,
        });
        continue;
      }

      // Upsert employee
      const existing = await prisma.employees.findUnique({ where: { email } });
      const empData = {
        name,
        function_id: fn.id,
        role_id: role.id,
        pod_id: pod?.id ?? null,
        status: 'ACTIVE' as const,
      };

      let emp: { id: string };
      if (existing) {
        emp = await prisma.employees.update({ where: { email }, data: empData });
        results.push({ row: rowNum, status: 'updated', message: `Updated ${email}` });
      } else {
        emp = await prisma.employees.create({
          data: {
            ...empData,
            email,
            google_id: `import_${Date.now()}_${i}`,
            system_role: 'EMPLOYEE',
          },
        });
        results.push({ row: rowNum, status: 'created', message: `Created ${email}` });
      }

      // Platforms — resolve valid ones, warn on invalid
      const validPlatforms = platformNames.filter((pn) =>
        allPlatforms.some((p) => p.name.toLowerCase() === pn.toLowerCase())
      );
      const invalidPlatforms = platformNames.filter(
        (pn) => !allPlatforms.some((p) => p.name.toLowerCase() === pn.toLowerCase())
      );

      for (const pn of validPlatforms) {
        const platform = allPlatforms.find((p) => p.name.toLowerCase() === pn.toLowerCase())!;
        await prisma.employee_platforms
          .upsert({
            where: { employee_id_platform_id: { employee_id: emp.id, platform_id: platform.id } },
            update: {},
            create: { id: crypto.randomUUID(), employee_id: emp.id, platform_id: platform.id },
          })
          .catch(() => null);
      }

      if (invalidPlatforms.length) {
        // Append warning to last result
        const last = results[results.length - 1];
        last.message += ` (unknown platforms ignored: ${invalidPlatforms.join(', ')})`;
      }
    } catch (e) {
      results.push({ row: rowNum, status: 'error', message: String(e) });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const updated = results.filter((r) => r.status === 'updated').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return { type: 'employees', created, updated, errors, results };
}

// ── Project import ─────────────────────────────────────────────────────────────
// Accepts BOTH formats:
//   1. RMS format: deal_name, brand_name, status, devx_pillar, billing_model, start_date, end_date, revenue_usd, project_manager_email
//   2. Zoho format: Record Id, Deal Name, Account Name, Closing Date, Total Deal Amount, Currency, Exchange Rate, Deal Type, Project Manager, etc.

function isZohoFormat(row: Record<string, unknown>): boolean {
  return 'Deal Name' in row && 'Account Name' in row;
}

// Map Zoho "Deal Type" → RMS billing_model
function mapDealTypeToBilling(dealType: string): string {
  const dt = dealType.toLowerCase();
  if (dt.includes('retainer') || dt.includes('maintenance')) return 'RETAINER';
  if (dt.includes('staff augmentation') || dt.includes('managed service')) return 'RETAINER';
  if (dt.includes('subscription')) return 'RETAINER';
  if (dt.includes('professional service') || dt.includes('resell')) return 'FIXED_PRICE';
  return 'TIME_AND_MATERIAL';
}

// Convert amount to INR cents using exchange rate
// Zoho exchange rates are relative to USD (CRM home currency):
//   INR @ 90 → 1 USD = 90 INR | USD @ 1 → 1 USD = 1 USD
// Formula: (amount / exchangeRate) converts to USD, then * INR_PER_USD converts to INR
const INR_PER_USD = Number(process.env.INR_PER_USD) || 90;

function toInrCents(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'INR') return Math.round(amount * 100);
  const inrAmount = (amount / exchangeRate) * INR_PER_USD;
  return Math.round(inrAmount * 100);
}

// Normalise a Zoho row into the RMS shape
function normaliseZohoRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    deal_name: row['Deal Name'],
    brand_name: row['Account Name'],
    zoho_deal_id: row['Record Id'],
    zoho_account_id: row['Account Name.id'],
    start_date: row['Closing Date'],
    end_date: '',
    status: 'ACTIVE', // All Zoho "Closed Won" deals are active
    devx_pillar: 'CUSTOMER_INTERACTION',
    billing_model: mapDealTypeToBilling(String(row['Deal Type'] ?? '')),
    revenue_amount: row['Total Deal Amount'],
    currency: row['Currency'],
    exchange_rate: row['Exchange Rate'],
    project_manager_name: row['Project Manager'],
  };
}

async function importProjects(rows: Record<string, unknown>[]) {
  const results: { row: number; status: 'created' | 'updated' | 'error'; message: string }[] = [];

  const VALID_STATUSES = ['UPCOMING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
  const VALID_PILLARS = ['CUSTOMER_INTERACTION', 'MARKETING_AUTOMATION', 'AI_OPS', 'ENTERPRISE_ARCHITECTURE'];
  const VALID_BILLING = ['TIME_AND_MATERIAL', 'FIXED_PRICE', 'RETAINER'];

  // Detect format from first row
  const zoho = rows.length > 0 && isZohoFormat(rows[0]);

  // Pre-fetch employees for PM name matching (Zoho gives names, not emails)
  const allEmployees = zoho
    ? await prisma.employees.findMany({ where: { deleted_at: null }, select: { id: true, name: true, email: true } })
    : [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const row = zoho ? normaliseZohoRow(raw) : raw;
    const rowNum = i + 2;
    try {
      const deal_name = String(row['deal_name'] ?? '').trim();
      const brand_name = String(row['brand_name'] ?? '').trim();
      const status = String(row['status'] ?? 'UPCOMING').trim().toUpperCase();
      const devx_pillar = String(row['devx_pillar'] ?? 'AI_OPS').trim().toUpperCase();
      const billing_model = String(row['billing_model'] ?? 'TIME_AND_MATERIAL').trim().toUpperCase();
      const start_date_raw = String(row['start_date'] ?? '').trim();
      const end_date_raw = String(row['end_date'] ?? '').trim();
      const zoho_deal_id = String(row['zoho_deal_id'] ?? '').trim() || null;
      const zoho_account_id = String(row['zoho_account_id'] ?? '').trim() || null;

      // Revenue: Zoho format has amount + currency + exchange_rate; RMS format has revenue_usd
      let revenue_cents: number;
      if (zoho) {
        const amount = parseFloat(String(row['revenue_amount'] ?? '0')) || 0;
        const currency = String(row['currency'] ?? 'INR').trim().toUpperCase();
        const exchangeRate = parseFloat(String(row['exchange_rate'] ?? '1')) || 1;
        revenue_cents = toInrCents(amount, currency, exchangeRate);
      } else {
        const revenue_usd = parseFloat(String(row['revenue_usd'] ?? '0')) || 0;
        revenue_cents = Math.round(revenue_usd * 100);
      }

      // PM: Zoho gives name, RMS gives email
      const pm_email = String(row['project_manager_email'] ?? '').trim().toLowerCase();
      const pm_name = String(row['project_manager_name'] ?? '').trim();

      // Validate required
      const missing: string[] = [];
      if (!deal_name) missing.push('deal_name');
      if (!brand_name) missing.push('brand_name');
      if (!start_date_raw) missing.push('start_date');
      if (missing.length) {
        results.push({ row: rowNum, status: 'error', message: `Missing: ${missing.join(', ')}` });
        continue;
      }

      // Validate enums
      if (!VALID_STATUSES.includes(status)) {
        results.push({ row: rowNum, status: 'error', message: `Invalid status "${status}". Valid: ${VALID_STATUSES.join(', ')}` });
        continue;
      }
      if (!VALID_PILLARS.includes(devx_pillar)) {
        results.push({ row: rowNum, status: 'error', message: `Invalid devx_pillar "${devx_pillar}". Valid: ${VALID_PILLARS.join(', ')}` });
        continue;
      }

      const start_date = new Date(start_date_raw);
      if (isNaN(start_date.getTime())) {
        results.push({ row: rowNum, status: 'error', message: `Invalid start_date "${start_date_raw}". Use YYYY-MM-DD format.` });
        continue;
      }
      const end_date = end_date_raw ? new Date(end_date_raw) : null;

      // Upsert account (with zoho_id if available)
      let account;
      if (zoho_account_id) {
        account = await prisma.accounts.upsert({
          where: { zoho_id: zoho_account_id },
          update: { brand_name },
          create: { brand_name, zoho_id: zoho_account_id },
        });
      } else {
        account = await prisma.accounts.upsert({
          where: { brand_name },
          update: {},
          create: { brand_name },
        });
      }

      // Resolve PM
      let pm_id: string | null = null;
      if (pm_email) {
        const pm = await prisma.employees.findUnique({ where: { email: pm_email }, select: { id: true } });
        if (!pm) {
          results.push({ row: rowNum, status: 'error', message: `PM email "${pm_email}" not found in employees.` });
          continue;
        }
        pm_id = pm.id;
      } else if (pm_name) {
        // Fuzzy match by name (case-insensitive)
        const match = allEmployees.find(
          (e) => e.name.toLowerCase() === pm_name.toLowerCase()
        );
        if (match) pm_id = match.id;
        // If no match, just skip PM silently — don't error
      }

      const projectData = {
        account_id: account.id,
        deal_name,
        zoho_deal_id: zoho_deal_id || undefined,
        status: status as never,
        devx_pillar: devx_pillar as never,
        billing_model: (VALID_BILLING.includes(billing_model) ? billing_model : 'TIME_AND_MATERIAL') as never,
        start_date,
        end_date,
        revenue_cents,
        project_manager_id: pm_id,
      };

      // Check if exists by zoho_deal_id (preferred) or deal_name + account
      let existing = null;
      if (zoho_deal_id) {
        existing = await prisma.rms_projects.findUnique({ where: { zoho_deal_id } });
      }
      if (!existing) {
        existing = await prisma.rms_projects.findFirst({
          where: { deal_name, account_id: account.id, deleted_at: null },
        });
      }

      if (existing) {
        await prisma.rms_projects.update({ where: { id: existing.id }, data: projectData });
        results.push({ row: rowNum, status: 'updated', message: `Updated project "${deal_name}" (${brand_name})` });
      } else {
        await prisma.rms_projects.create({ data: { ...projectData, expected_compute_cost_cents: 0 } });
        results.push({ row: rowNum, status: 'created', message: `Created project "${deal_name}" (${brand_name})` });
      }
    } catch (e) {
      results.push({ row: rowNum, status: 'error', message: String(e) });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const updated = results.filter((r) => r.status === 'updated').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return { type: 'projects', created, updated, errors, results };
}
