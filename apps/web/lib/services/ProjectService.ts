import type { SystemRole } from '@devx/types';
import { prisma } from '@/lib/prisma';

export async function getProjects(
  actor_role: SystemRole,
  _actor_id: string,
  filters: {
    status?: string;
    devx_pillar?: string;
    account_id?: string;
    search?: string;
    project_manager_id?: string;
    growth_consultant_id?: string;
    page?: number;
    page_size?: number;
    include_hidden?: boolean;
  },
) {
  const where: Record<string, unknown> = {
    deleted_at: null,
    ...(filters.include_hidden ? {} : { show_in_allocations: true }),
    ...(filters.status
      ? filters.status.includes(',')
        ? { status: { in: filters.status.split(',') } }
        : { status: filters.status }
      : {}),
    ...(filters.devx_pillar ? { devx_pillar: filters.devx_pillar } : {}),
    ...(filters.account_id ? { account_id: filters.account_id } : {}),
    ...(filters.project_manager_id
      ? filters.project_manager_id === '__none__'
        ? { project_manager_id: null }
        : { project_manager_id: filters.project_manager_id }
      : {}),
    ...(filters.growth_consultant_id ? { growth_consultant_id: filters.growth_consultant_id } : {}),
    ...(filters.search
      ? {
          OR: [
            { deal_name: { contains: filters.search, mode: 'insensitive' } },
            { account: { brand_name: { contains: filters.search, mode: 'insensitive' } } },
            { zoho_deal_id: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const usePagination = filters.page != null && filters.page_size != null;

  const include = {
    account: { select: { id: true, brand_name: true } },
    project_manager: { select: { id: true, name: true } },
    growth_consultant: { select: { id: true, name: true } },
    practice_poc: { select: { id: true, name: true } },
  };

  const [projects, total] = await Promise.all([
    prisma.rms_projects.findMany({
      where,
      include,
      orderBy: { created_at: 'desc' },
      ...(usePagination ? { skip: (filters.page! - 1) * filters.page_size!, take: filters.page_size! } : {}),
    }),
    usePagination ? prisma.rms_projects.count({ where }) : Promise.resolve(0),
  ]);

  // Strip revenue for non-admins
  const sanitized = projects.map((p) => ({
    ...p,
    revenue_cents: actor_role === 'ADMIN' ? p.revenue_cents : undefined,
  }));

  if (usePagination) {
    return { data: sanitized, total, page: filters.page!, page_size: filters.page_size! };
  }

  return sanitized;
}

export async function getGrowthConsultants() {
  const results = await prisma.rms_projects.findMany({
    where: { deleted_at: null, growth_consultant_id: { not: null } },
    select: { growth_consultant: { select: { id: true, name: true } } },
    distinct: ['growth_consultant_id'],
  });
  return results
    .map((r) => r.growth_consultant!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProjectById(id: string, actor_role: SystemRole) {
  const project = await prisma.rms_projects.findUnique({
    where: { id },
    include: {
      account: true,
      project_manager: { select: { id: true, name: true } },
      growth_consultant: { select: { id: true, name: true } },
      practice_poc: { select: { id: true, name: true } },
      technologies: { include: { technology: true } },
    },
  });

  if (!project) return null;

  return {
    ...project,
    revenue_cents: actor_role === 'ADMIN' ? project.revenue_cents : undefined,
  };
}

// Parse date strings — handles mm-dd-yyyy (Zoho), yyyy-mm-dd (ISO), and ISO timestamps
function parseDate(raw: string): Date {
  const trimmed = raw.trim();
  // mm-dd-yyyy or mm/dd/yyyy
  const mdyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mdyMatch) {
    return new Date(Number(mdyMatch[3]), Number(mdyMatch[1]) - 1, Number(mdyMatch[2]));
  }
  // Fall back to native parsing (handles ISO strings, yyyy-mm-dd, etc.)
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: "${raw}"`);
  return d;
}

export async function createFromWebhook(payload: {
  zoho_deal_id: string;
  deal_name: string;
  account_name: string;
  zoho_account_id?: string;
  revenue_cents: number;
  billing_model: string;
  devx_pillar?: string;
  start_date: string;
  end_date?: string;
  expected_compute_cost_cents?: number;
  sow_url?: string;
  project_manager_email?: string;
  growth_consultant_email?: string;
  stage?: string;
  // New Zoho deal fields
  currency?: string;
  exchange_rate?: number;
  product?: string | null;
  description?: string | null;
  deal_tech_stack?: string | null;
  deal_type?: string | null;
  lead_source?: string | null;
  documents_folder?: string | null;
  pre_closed_resource_alignment?: string | null;
  probability?: number | null;
  expected_revenue_cents?: number | null;
  total_deal_amount_cents?: number | null;
  sub_practice_1_name?: string | null;
  sub_practice_1_amount_cents?: number | null;
  sub_practice_2_name?: string | null;
  sub_practice_2_amount_cents?: number | null;
  sub_practice_3_name?: string | null;
  sub_practice_3_amount_cents?: number | null;
  sub_practice_4_name?: string | null;
  sub_practice_4_amount_cents?: number | null;
}) {
  // Deals reach RMS only when Closed Won OR Pre-Closed Resource Alignment
  const preClosedAlignment = String(payload.pre_closed_resource_alignment ?? '').toLowerCase() === 'true';
  const status = payload.stage === 'Closed Won' || preClosedAlignment ? 'ACTIVE' : 'UPCOMING';
  const showInAllocations = status === 'ACTIVE';

  // Resolve account: prefer zoho_id match, then brand_name match, then create
  let account = payload.zoho_account_id
    ? await prisma.accounts.findFirst({ where: { zoho_id: payload.zoho_account_id } })
    : null;

  if (!account) {
    account = await prisma.accounts.upsert({
      where: { brand_name: payload.account_name },
      update: {
        ...(payload.zoho_account_id ? { zoho_id: payload.zoho_account_id } : {}),
      },
      create: {
        brand_name: payload.account_name,
        zoho_id: payload.zoho_account_id || null,
      },
    });
  } else if (payload.zoho_account_id) {
    // Update zoho_id on the matched account
    await prisma.accounts.update({
      where: { id: account.id },
      data: { zoho_id: payload.zoho_account_id },
    });
  }

  // Resolve people by email
  const [pm, consultant] = await Promise.all([
    payload.project_manager_email
      ? prisma.employees.findUnique({
          where: { email: payload.project_manager_email },
          select: { id: true },
        })
      : null,
    payload.growth_consultant_email
      ? prisma.employees.findUnique({
          where: { email: payload.growth_consultant_email },
          select: { id: true },
        })
      : null,
  ]);

  // Shared new-field data for both create and update
  const zohoFields = {
    product: payload.product,
    description: payload.description,
    deal_tech_stack: payload.deal_tech_stack,
    deal_type: payload.deal_type,
    lead_source: payload.lead_source,
    documents_folder: payload.documents_folder,
    pre_closed_resource_alignment: payload.pre_closed_resource_alignment,
    probability: payload.probability,
    expected_revenue_cents: payload.expected_revenue_cents,
    total_deal_amount_cents: payload.total_deal_amount_cents,
    currency: payload.currency,
    exchange_rate: payload.exchange_rate,
    sub_practice_1_name: payload.sub_practice_1_name,
    sub_practice_1_amount_cents: payload.sub_practice_1_amount_cents,
    sub_practice_2_name: payload.sub_practice_2_name,
    sub_practice_2_amount_cents: payload.sub_practice_2_amount_cents,
    sub_practice_3_name: payload.sub_practice_3_name,
    sub_practice_3_amount_cents: payload.sub_practice_3_amount_cents,
    sub_practice_4_name: payload.sub_practice_4_name,
    sub_practice_4_amount_cents: payload.sub_practice_4_amount_cents,
  };

  return prisma.rms_projects.upsert({
    where: { zoho_deal_id: payload.zoho_deal_id },
    update: {
      deal_name: payload.deal_name,
      account_id: account.id,
      revenue_cents: payload.revenue_cents,
      billing_model: payload.billing_model as never,
      devx_pillar: (payload.devx_pillar ?? 'AI_OPS') as never,
      status: status as never,
      show_in_allocations: showInAllocations,
      start_date: parseDate(payload.start_date),
      ...(payload.end_date ? { end_date: parseDate(payload.end_date) } : {}),
      deleted_at: null,
      growth_consultant_id: consultant?.id,
      project_manager_id: pm?.id,
      sow_url: payload.sow_url || payload.documents_folder || undefined,
      ...zohoFields,
    },
    create: {
      account_id: account.id,
      deal_name: payload.deal_name,
      zoho_deal_id: payload.zoho_deal_id,
      revenue_cents: payload.revenue_cents,
      billing_model: payload.billing_model as never,
      devx_pillar: (payload.devx_pillar ?? 'AI_OPS') as never,
      start_date: parseDate(payload.start_date),
      end_date: payload.end_date ? parseDate(payload.end_date) : null,
      expected_compute_cost_cents: payload.expected_compute_cost_cents ?? 0,
      sow_url: payload.sow_url || payload.documents_folder || undefined,
      project_manager_id: pm?.id,
      growth_consultant_id: consultant?.id,
      status: status as never,
      show_in_allocations: showInAllocations,
      ...zohoFields,
    },
  });
}

// ── Admin: manually create a project ──────────────────────────────────────────
export async function createProject(data: {
  deal_name: string;
  account_id?: string;
  new_account_name?: string;
  status?: string;
  billing_model?: string;
  devx_pillar?: string;
  start_date?: string;
  end_date?: string | null;
  sow_url?: string | null;
  expected_compute_cost_cents?: number;
  project_manager_id?: string | null;
  growth_consultant_id?: string | null;
  practice_poc_id?: string | null;
  show_in_allocations?: boolean;
}) {
  if (!data.deal_name?.trim()) throw new Error('Deal name is required');

  // Resolve or create account
  let accountId = data.account_id;
  if (!accountId && data.new_account_name?.trim()) {
    const account = await prisma.accounts.upsert({
      where: { brand_name: data.new_account_name.trim() },
      update: {},
      create: { brand_name: data.new_account_name.trim() },
    });
    accountId = account.id;
  }
  if (!accountId) throw new Error('Account is required');

  const project = await prisma.rms_projects.create({
    data: {
      deal_name: data.deal_name.trim(),
      account_id: accountId,
      status: (data.status ?? 'UPCOMING') as never,
      billing_model: (data.billing_model ?? 'TIME_AND_MATERIAL') as never,
      devx_pillar: (data.devx_pillar ?? 'AI_OPS') as never,
      start_date: data.start_date ? new Date(data.start_date) : new Date(),
      end_date: data.end_date ? new Date(data.end_date) : null,
      sow_url: data.sow_url ?? null,
      expected_compute_cost_cents: data.expected_compute_cost_cents ?? 0,
      project_manager_id: data.project_manager_id ?? null,
      growth_consultant_id: data.growth_consultant_id ?? null,
      practice_poc_id: data.practice_poc_id ?? null,
      show_in_allocations: data.show_in_allocations ?? true,
    },
  });

  return project;
}

// ── Admin: update editable project fields ────────────────────────────────────
export async function updateProject(
  id: string,
  data: {
    deal_name?: string;
    account_id?: string;
    billing_model?: string;
    devx_pillar?: string;
    status?: string;
    start_date?: string;
    end_date?: string | null;
    project_manager_id?: string | null;
    growth_consultant_id?: string | null;
    practice_poc_id?: string | null;
    sow_url?: string | null;
    expected_compute_cost_cents?: number;
    show_in_allocations?: boolean;
  },
) {
  const before = await prisma.rms_projects.findUniqueOrThrow({
    where: { id, deleted_at: null },
  });

  const updateData: Record<string, unknown> = { ...data };
  if (data.start_date) updateData.start_date = new Date(data.start_date);
  if (data.end_date !== undefined) {
    updateData.end_date = data.end_date ? new Date(data.end_date) : null;
  }

  const after = await prisma.rms_projects.update({
    where: { id },
    data: updateData as never,
  });

  // Auto-deactivate allocations and hide from allocations when project is completed or cancelled
  if ((data.status === 'COMPLETED' || data.status === 'CANCELLED') && before.status !== data.status) {
    await Promise.all([
      prisma.rms_allocations.updateMany({
        where: { project_id: id, deleted_at: null },
        data: { deleted_at: new Date() },
      }),
      prisma.rms_projects.update({
        where: { id },
        data: { show_in_allocations: false },
      }),
    ]);
  }

  // Auto-remove allocations when visibility is toggled OFF
  if (data.show_in_allocations === false && before.show_in_allocations === true) {
    await prisma.rms_allocations.updateMany({
      where: { project_id: id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  return { before, after };
}

// ── Admin: soft-delete a project ──────────────────────────────────────────────
export async function deleteProject(id: string) {
  const before = await prisma.rms_projects.findUniqueOrThrow({
    where: { id, deleted_at: null },
  });

  const after = await prisma.rms_projects.update({
    where: { id },
    data: { deleted_at: new Date(), status: 'CANCELLED' as never },
  });

  return { before, after };
}
