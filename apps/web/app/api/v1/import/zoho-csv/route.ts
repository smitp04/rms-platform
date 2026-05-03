import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

// Deal Owner is resolved dynamically from employees table (by name or email, case-insensitive)

// Sub Practice Name → devx Pillar enum
const PILLAR_MAP: Record<string, string> = {
  'Customer Interaction': 'CUSTOMER_INTERACTION',
  'AI Led Business Operations': 'AI_OPS',
  'Enterprise Architecture': 'ENTERPRISE_ARCHITECTURE',
  'Marketing Automation': 'MARKETING_AUTOMATION',
};

// Currency conversion: all amounts stored as INR cents
const INR_PER_USD = Number(process.env.INR_PER_USD) || 90;
function toInrCents(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'INR') return Math.round(amount * 100);
  return Math.round((amount / exchangeRate) * INR_PER_USD * 100);
}

// Deal Type → Billing Model
function mapBillingModel(dealType: string): string {
  if (dealType.includes('Managed Services')) return 'TIME_AND_MATERIAL';
  if (dealType.includes('Professional Services')) return 'TIME_AND_MATERIAL';
  return 'OUTCOME_BASED';
}

// Parse a CSV line handling commas inside quotes
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ZohoRow {
  zoho_deal_id: string;
  deal_name: string;
  account_name: string;
  closing_date: string;
  deal_owner: string;
  deal_type: string;
  total_amount: number;
  currency: string;
  exchange_rate: number;
  tech_stack: string[];
  sub_practice_name: string;
  billing_model: string;
  devx_pillar: string;
  stage: string;
  owner_email: string | null;
  // resolved
  errors: string[];
}

// POST /api/v1/import/zoho-csv
// Body: { csv: string, dryRun?: boolean }
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'employee:write')) {
      throw new ApiError(403, 'Only admins can import data');
    }

    const body = await req.json();
    const { csv, dryRun = true } = body as { csv: string; dryRun?: boolean };

    if (!csv) throw new ApiError(400, 'csv field is required');

    // Parse CSV
    const lines = csv.trim().split('\n');
    const headers = parseCsvLine(lines[0]);

    const getIdx = (name: string) => headers.indexOf(name);
    const idx = {
      recordId: getIdx('Record Id'),
      dealName: getIdx('Deal Name'),
      accountName: getIdx('Account Name'),
      closingDate: getIdx('Closing Date'),
      dealOwner: getIdx('Deal Owner'),
      dealType: getIdx('Deal Type'),
      totalAmount: getIdx('Total Deal Amount'),
      currency: getIdx('Currency'),
      exchangeRate: getIdx('Exchange Rate'),
      techStack: getIdx('Deal Tech Stack'),
      sub1Name: getIdx('Sub Practice 1 - Name'),
      sub2Name: getIdx('Sub Practice 2 - Name'),
      sub3Name: getIdx('Sub Practice 3 - Name'),
      sub4Name: getIdx('Sub Practice 4 - Name'),
      product: getIdx('Product'),
      stage: getIdx('Stage'),
    };

    // Pre-fetch employees for dynamic deal owner resolution
    const allEmployees = await prisma.employees.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, email: true },
    });

    const rows: ZohoRow[] = [];
    let skippedProductDeals = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCsvLine(line);

      // Skip deals that have a real Product value (e.g. "cartx", "RetailOS")
      // — these are product sales, not service projects
      const product = idx.product >= 0 ? (cols[idx.product]?.trim() ?? '') : '';
      if (product && product.toLowerCase() !== 'no product') {
        skippedProductDeals++;
        continue;
      }

      const totalAmount = parseFloat(cols[idx.totalAmount] ?? '0') || 0;
      const exchangeRate = parseFloat(cols[idx.exchangeRate] ?? '1') || 1;
      const currency = cols[idx.currency]?.trim() ?? 'INR';

      const dealOwner = cols[idx.dealOwner]?.trim() ?? '';
      const stage = idx.stage >= 0 ? (cols[idx.stage]?.trim() ?? '') : '';

      // Resolve deal owner dynamically by name or email (case-insensitive)
      const ownerMatch = allEmployees.find(
        (e) => e.name.toLowerCase() === dealOwner.toLowerCase() || e.email.toLowerCase() === dealOwner.toLowerCase()
      );
      const ownerEmail = ownerMatch?.email ?? null;

      // Determine primary pillar from sub practices
      const subPracticeNames = [
        cols[idx.sub1Name]?.trim(),
        cols[idx.sub2Name]?.trim(),
        cols[idx.sub3Name]?.trim(),
        cols[idx.sub4Name]?.trim(),
      ].filter(Boolean) as string[];

      const primaryPillar = subPracticeNames[0] ?? '';
      const devxPillar = PILLAR_MAP[primaryPillar] ?? 'AI_OPS';

      const dealType = cols[idx.dealType]?.trim() ?? '';
      const billingModel = mapBillingModel(dealType);

      const techStack = (cols[idx.techStack] ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);

      const errors: string[] = [];
      if (!cols[idx.dealName]?.trim()) errors.push('Missing deal_name');
      if (!cols[idx.accountName]?.trim()) errors.push('Missing account_name');
      if (!cols[idx.closingDate]?.trim()) errors.push('Missing closing_date');

      rows.push({
        zoho_deal_id: cols[idx.recordId]?.trim() ?? '',
        deal_name: cols[idx.dealName]?.trim() ?? '',
        account_name: cols[idx.accountName]?.trim() ?? '',
        closing_date: cols[idx.closingDate]?.trim() ?? '',
        deal_owner: dealOwner,
        deal_type: dealType,
        total_amount: totalAmount,
        currency,
        exchange_rate: exchangeRate,
        tech_stack: techStack,
        sub_practice_name: primaryPillar,
        billing_model: billingModel,
        devx_pillar: devxPillar,
        stage,
        owner_email: ownerEmail,
        errors,
      });
    }

    const validRows = rows.filter((r) => r.errors.length === 0);
    const invalidRows = rows.filter((r) => r.errors.length > 0);

    if (dryRun) {
      return apiSuccess({
        dryRun: true,
        total: rows.length + skippedProductDeals,
        skippedProductDeals,
        valid: validRows.length,
        invalid: invalidRows.length,
        rows,
      });
    }

    // ── Actual import ──────────────────────────────────────────────────────────
    const results: { row: number; status: 'created' | 'updated' | 'skipped' | 'error'; message: string }[] = [];

    // Pre-fetch owner employees
    const ownerEmails = [...new Set(validRows.map((r) => r.owner_email).filter(Boolean) as string[])];
    const ownerEmployees = await prisma.employees.findMany({
      where: { email: { in: ownerEmails } },
      select: { id: true, email: true },
    });
    const ownerMap = Object.fromEntries(ownerEmployees.map((e) => [e.email, e.id]));

    // Pre-fetch technologies
    const allTechs = await prisma.rms_technologies.findMany();
    const techMap = Object.fromEntries(allTechs.map((t: { name: string; id: string }) => [t.name.toLowerCase(), t.id]));

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const rowNum = i + 2;
      try {
        // Upsert account
        const account = await prisma.accounts.upsert({
          where: { brand_name: row.account_name },
          update: {},
          create: { brand_name: row.account_name },
        });

        const startDate = new Date(row.closing_date);
        const growthConsultantId = row.owner_email ? (ownerMap[row.owner_email] ?? null) : null;

        const projectData = {
          account_id: account.id,
          deal_name: row.deal_name,
          zoho_deal_id: row.zoho_deal_id || null,
          status: (row.stage === 'Closed Won' ? 'ACTIVE' : row.stage === 'Closed Lost' ? 'CANCELLED' : 'UPCOMING') as never,
          show_in_allocations: row.stage === 'Closed Won',
          devx_pillar: row.devx_pillar as never,
          billing_model: row.billing_model as never,
          start_date: startDate,
          revenue_cents: toInrCents(row.total_amount, row.currency, row.exchange_rate),
          growth_consultant_id: growthConsultantId,
          expected_compute_cost_cents: 0,
        };

        // Check if already exists by zoho_deal_id
        const existing = row.zoho_deal_id
          ? await prisma.rms_projects.findUnique({ where: { zoho_deal_id: row.zoho_deal_id } })
          : null;

        let projectId: string;
        if (existing) {
          await prisma.rms_projects.update({ where: { id: existing.id }, data: projectData });
          projectId = existing.id;
          results.push({ row: rowNum, status: 'updated', message: `Updated "${row.deal_name}"` });
        } else {
          const created = await prisma.rms_projects.create({ data: projectData });
          projectId = created.id;
          results.push({ row: rowNum, status: 'created', message: `Created "${row.deal_name}"` });
        }

        // Link technologies
        for (const techName of row.tech_stack) {
          const techId = techMap[techName.toLowerCase()];
          if (techId) {
            await prisma.rms_project_technologies.upsert({
              where: { project_id_technology_id: { project_id: projectId, technology_id: techId } },
              update: {},
              create: { id: crypto.randomUUID(), project_id: projectId, technology_id: techId },
            }).catch(() => null);
          }
        }
      } catch (e) {
        results.push({ row: rowNum, status: 'error', message: String(e) });
      }
    }

    // Add skipped invalid rows
    invalidRows.forEach((r, i) => {
      results.push({ row: validRows.length + i + 2, status: 'skipped', message: r.errors.join('; ') });
    });

    const created = results.filter((r) => r.status === 'created').length;
    const updated = results.filter((r) => r.status === 'updated').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return apiSuccess({ dryRun: false, total: rows.length + skippedProductDeals, skippedProductDeals, created, updated, errors, skipped, results });
  } catch (err) {
    return apiError(err);
  }
}
