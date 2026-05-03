import { prisma } from '@/lib/prisma';
import { writeAuditLog } from './AuditService';
import { createFromGoogleAdmin, offboardFromGoogleAdmin } from './EmployeeService';
import { createFromWebhook } from './ProjectService';

// Sub Practice Name → DevxPillar enum
const PILLAR_MAP: Record<string, string> = {
  'Customer Interaction': 'CUSTOMER_INTERACTION',
  'AI Led Business Operations': 'AI_OPS',
  'Enterprise Architecture': 'ENTERPRISE_ARCHITECTURE',
  'Marketing Automation': 'MARKETING_AUTOMATION',
};

function mapBillingModel(dealType: string): string {
  if (dealType.includes('Managed Services')) return 'TIME_AND_MATERIAL';
  if (dealType.includes('Professional Services')) return 'TIME_AND_MATERIAL';
  return 'OUTCOME_BASED';
}

// Zoho exchange rates are relative to USD (the CRM home currency):
//   INR @ 90  → 1 USD = 90 INR
//   USD @ 1   → 1 USD = 1 USD
//   EUR @ 1.2 → 1 USD = 1.2 EUR
//   AUD @ 1.43 → 1 USD = 1.43 AUD
// To convert any currency to INR: (amount / exchangeRate) * INR_PER_USD
const INR_PER_USD = Number(process.env.INR_PER_USD) || 90;

function toInr(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'INR') return amount;
  return (amount / exchangeRate) * INR_PER_USD;
}

// Flexible employee lookup: exact name/email → first name match → email prefix match
async function findEmployeeByNameOrEmail(nameOrEmail: string) {
  // 1. Exact match (name or email)
  let emp = await prisma.employees.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { email: { equals: nameOrEmail, mode: 'insensitive' } },
        { name: { equals: nameOrEmail, mode: 'insensitive' } },
      ],
    },
    select: { email: true },
  });
  if (emp) return emp;

  // 2. Try first name from "Firstname Lastname" (DB may store just first name)
  const firstName = nameOrEmail.split(' ')[0];
  if (firstName && firstName !== nameOrEmail) {
    const lastName = nameOrEmail.split(' ').slice(1).join(' ').toLowerCase();
    emp = await prisma.employees.findFirst({
      where: {
        deleted_at: null,
        name: { equals: firstName, mode: 'insensitive' },
      },
      select: { email: true },
    });
    // Verify via email prefix to avoid false positives (e.g. two "Kaustubh"s)
    if (emp && lastName && emp.email.toLowerCase().includes(lastName.replace(/\s/g, '').toLowerCase())) {
      return emp;
    }
    // If only one employee with that first name, use it
    if (emp) {
      const count = await prisma.employees.count({
        where: { deleted_at: null, name: { equals: firstName, mode: 'insensitive' } },
      });
      if (count === 1) return emp;
    }
  }

  return null;
}

export async function handleCrmWebhook(payload: Record<string, unknown>) {
  const log = await prisma.webhook_logs.create({
    data: { source: 'zoho_crm', payload: payload as object, status: 'received' },
  });

  try {
    // Normalize Zoho field names (Zoho sends PascalCase/mixed-case keys)
    const zohoId = String(payload.zoho_deal_id || payload.id || '').trim();
    const dealName = String(payload.deal_name || payload.Deal_Name || '').trim();
    const rawAccountName = String(payload.account_name || '').trim();
    const zohoAccountId = String(payload.zoho_account_id || '').trim() || undefined;

    // Resolve account name:
    // 1. If account_name is a real name (not all digits), use it directly
    // 2. If it looks like a Zoho ID (all digits), resolve via DB lookup
    // 3. Fall back to deal name
    let accountName = '';
    if (rawAccountName && !/^\d+$/.test(rawAccountName)) {
      // n8n sends real account name (resolved via Zoho API)
      accountName = rawAccountName;
    } else {
      // Legacy: account_name is a Zoho ID — resolve from DB
      const lookupId = zohoAccountId || rawAccountName || undefined;
      if (lookupId) {
        const existingAccount = await prisma.accounts.findFirst({
          where: { zoho_id: lookupId },
          select: { brand_name: true },
        });
        accountName = existingAccount?.brand_name ?? '';
      }
    }
    if (!accountName) accountName = dealName || 'Unknown';
    const rawRevenue = Number(
      payload.revenue || payload.Revenue || payload.amount || payload.Amount || payload.total_deal_amount || 0,
    );
    const rawType = String(payload.type || payload.Type || '').trim() || null;
    const closingDate = String(payload.start_date || payload.closing_date || payload.Closing_Date || '').trim();
    const dealOwner = String(payload.deal_owner || payload.Deal_owner || '').trim();
    const stage = String(payload.stage || payload.Stage || '').trim() || undefined;

    // Currency & exchange rate
    const currency = String(payload.currency || 'INR')
      .trim()
      .toUpperCase();
    const exchangeRate = Number(payload.exchange_rate || 1) || 1;
    const revenueInr = toInr(rawRevenue, currency, exchangeRate);

    // New Zoho fields
    const product = String(payload.product || '').trim() || null;
    const description = String(payload.description || '').trim() || null;
    const dealTechStack = String(payload.deal_tech_stack || '').trim() || null;
    const dealType = String(payload.deal_type || rawType || '').trim() || null;
    const leadSource = String(payload.lead_source || '').trim() || null;
    const documentsFolder = String(payload.documents_folder || '').trim() || null;
    const preClosedResourceAlignment = String(payload.pre_closed_resource_alignment || '').trim() || null;
    const probability = payload.probability != null ? Number(payload.probability) || null : null;
    const expectedRevenueCents = payload.expected_revenue
      ? Math.round(toInr(Number(payload.expected_revenue), currency, exchangeRate) * 100)
      : null;
    const totalDealAmountCents = payload.total_deal_amount
      ? Math.round(toInr(Number(payload.total_deal_amount), currency, exchangeRate) * 100)
      : null;

    // Sub-practice breakdown (convert to INR cents)
    const sp1Name = String(payload.sub_practice_1_name || '').trim() || null;
    const sp1Amount = payload.sub_practice_1_amount
      ? Math.round(toInr(Number(payload.sub_practice_1_amount), currency, exchangeRate) * 100)
      : null;
    const sp2Name = String(payload.sub_practice_2_name || '').trim() || null;
    const sp2Amount = payload.sub_practice_2_amount
      ? Math.round(toInr(Number(payload.sub_practice_2_amount), currency, exchangeRate) * 100)
      : null;
    const sp3Name = String(payload.sub_practice_3_name || '').trim() || null;
    const sp3Amount = payload.sub_practice_3_amount
      ? Math.round(toInr(Number(payload.sub_practice_3_amount), currency, exchangeRate) * 100)
      : null;
    const sp4Name = String(payload.sub_practice_4_name || '').trim() || null;
    const sp4Amount = payload.sub_practice_4_amount
      ? Math.round(toInr(Number(payload.sub_practice_4_amount), currency, exchangeRate) * 100)
      : null;

    // Validate required fields
    if (!zohoId) {
      throw new Error('Missing required field: zoho_deal_id / id');
    }
    if (!dealName) {
      throw new Error('Missing required field: deal_name / Deal_Name');
    }

    // Resolve growth_consultant_email from deal_owner (name or email) if not provided directly
    let growthConsultantEmail = payload.growth_consultant_email ? String(payload.growth_consultant_email) : undefined;
    if (!growthConsultantEmail && dealOwner) {
      const employee = await findEmployeeByNameOrEmail(dealOwner);
      if (employee) growthConsultantEmail = employee.email;
    }

    // Resolve project_manager — may come as name or email
    let projectManagerEmail = payload.project_manager_email ? String(payload.project_manager_email) : undefined;
    if (!projectManagerEmail && payload.project_manager) {
      const pmName = String(payload.project_manager).trim();
      if (pmName) {
        const emp = await findEmployeeByNameOrEmail(pmName);
        if (emp) projectManagerEmail = emp.email;
      }
    }

    // Derive billing_model from deal type if not provided directly
    const billingModel = payload.billing_model
      ? String(payload.billing_model)
      : rawType
        ? mapBillingModel(rawType)
        : 'TIME_AND_MATERIAL';

    const project = await createFromWebhook({
      zoho_deal_id: zohoId,
      deal_name: dealName,
      account_name: accountName,
      zoho_account_id: zohoAccountId,
      revenue_cents: Math.round(revenueInr * 100), // revenueInr already converted to INR via toInr()
      billing_model: billingModel,
      devx_pillar: PILLAR_MAP[sp1Name ?? ''] ?? 'AI_OPS',
      start_date: closingDate || new Date().toISOString(),
      end_date: payload.end_date ? String(payload.end_date) : undefined,
      expected_compute_cost_cents: Math.round(Number(payload.expected_compute_cost ?? 0) * 100),
      sow_url: payload.sow_url ? String(payload.sow_url) : undefined,
      project_manager_email: projectManagerEmail,
      growth_consultant_email: growthConsultantEmail,
      stage,
      // New Zoho deal fields
      currency,
      exchange_rate: exchangeRate,
      product,
      description,
      deal_tech_stack: dealTechStack,
      deal_type: dealType,
      lead_source: leadSource,
      documents_folder: documentsFolder,
      pre_closed_resource_alignment: preClosedResourceAlignment,
      probability,
      expected_revenue_cents: expectedRevenueCents,
      total_deal_amount_cents: totalDealAmountCents,
      sub_practice_1_name: sp1Name,
      sub_practice_1_amount_cents: sp1Amount,
      sub_practice_2_name: sp2Name,
      sub_practice_2_amount_cents: sp2Amount,
      sub_practice_3_name: sp3Name,
      sub_practice_3_amount_cents: sp3Amount,
      sub_practice_4_name: sp4Name,
      sub_practice_4_amount_cents: sp4Amount,
    });

    await prisma.webhook_logs.update({
      where: { id: log.id },
      data: { status: 'processed', processed_at: new Date() },
    });

    return project;
  } catch (err) {
    await prisma.webhook_logs.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

export async function handleGoogleAdminWebhook(payload: Record<string, unknown>) {
  const eventType = String(payload.event_type ?? 'create').toLowerCase();
  const log = await prisma.webhook_logs.create({
    data: { source: 'google_admin', payload: payload as object, status: 'received' },
  });

  try {
    const email = String(payload.primaryEmail ?? payload.email ?? '');

    // Only process @devxlabs.ai emails — skip other domains (e.g. devxtechnology.com)
    // Also skip shared/group mailboxes that aren't real employees
    const BLOCKED_PREFIXES = [
      'accounts',
      'admin',
      'billing',
      'contact',
      'design',
      'devxhouse',
      'finance',
      'hello',
      'help',
      'helpdesk',
      'hiring',
      'hr',
      'icc',
      'info',
      'it',
      'leaves',
      'marketing',
      'noreply',
      'office',
      'ops',
      'practiceteam',
      'reception',
      'sales',
      'support',
      'team',
      'tech',
      'test',
    ];
    const emailPrefix = email.split('@')[0]?.toLowerCase();
    const isBlocked = BLOCKED_PREFIXES.some((b) => emailPrefix === b || emailPrefix.startsWith(`${b}.`));
    if (!email.endsWith('@devxlabs.ai') || isBlocked) {
      await prisma.webhook_logs.update({
        where: { id: log.id },
        data: { status: 'skipped', processed_at: new Date() },
      });
      return null;
    }

    // Offboarding: suspend/archive → RESIGNED, delete → TERMINATED
    if (eventType === 'suspend' || eventType === 'delete' || eventType === 'archive') {
      const result = await offboardFromGoogleAdmin({
        email,
        event_type: eventType as 'suspend' | 'delete' | 'archive',
      });

      if (result && 'before' in result) {
        await writeAuditLog({
          entity_type: 'employee',
          entity_id: result.after.id,
          action: 'update',
          changed_by: 'webhook:google_admin',
          old_value: { status: result.before.status },
          new_value: { status: result.after.status, resignation_date: result.after.resignation_date },
        });
      }

      await prisma.webhook_logs.update({
        where: { id: log.id },
        data: { status: 'processed', processed_at: new Date() },
      });

      return result;
    }

    // Onboarding: create new employee or update google_id for existing
    const employee = await createFromGoogleAdmin({
      google_id: String(payload.id ?? payload.google_id ?? ''),
      email,
      name: String(
        (payload.name as Record<string, string> | undefined)?.fullName ??
          `${(payload.name as Record<string, string> | undefined)?.givenName ?? ''} ${(payload.name as Record<string, string> | undefined)?.familyName ?? ''}`.trim() ??
          '',
      ),
    });

    await prisma.webhook_logs.update({
      where: { id: log.id },
      data: { status: 'processed', processed_at: new Date() },
    });

    return employee;
  } catch (err) {
    await prisma.webhook_logs.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
