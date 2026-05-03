/**
 * seed-employees.ts
 *
 * Imports employees from the CSV export into the RMS database.
 * Idempotent — safe to run multiple times (uses upsert throughout).
 *
 * Run:
 *   DATABASE_URL=... ts-node --compiler-options '{"module":"CommonJS"}' src/seed-employees.ts
 */

import { PrismaClient, SystemRole, EmployeeStatus } from '../generated/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CSV parsing — handles fields that contain commas inside quoted strings
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Role + Function mapping
// ---------------------------------------------------------------------------

/**
 * Derives the RMS (function, roleName) from the CSV "Roles" string.
 * CSV roles may be semicolon-separated; we take the first significant one.
 */
function mapCsvRole(csvRoles: string): { functionName: string; roleName: string } {
  // Take the first role when multiple are listed (e.g. "Fullstack Developer; Mobile Developer")
  const primary = csvRoles
    .split(';')[0]
    .trim()
    .replace(/\s+/g, ' ');

  const lc = primary.toLowerCase();

  if (lc.includes('ai developer') || lc === 'ai developer') {
    return { functionName: 'Tech', roleName: 'AI Engineer' };
  }
  if (lc.includes('data engineer')) {
    return { functionName: 'Tech', roleName: 'Data Engineer' };
  }
  if (lc.includes('devops') || lc === 'devops') {
    return { functionName: 'Tech', roleName: 'DevOps Engineer' };
  }
  if (lc === 'qa' || lc.includes('qa')) {
    return { functionName: 'Tech', roleName: 'Junior QA' };
  }
  if (lc === 'shopify developer') {
    return { functionName: 'Tech', roleName: 'SDE-1' };
  }
  if (lc === 'fynd') {
    return { functionName: 'Tech', roleName: 'SDE-1' };
  }
  if (
    lc.includes('backend developer') ||
    lc.includes('fullstack developer') ||
    lc.includes('frontend developer') ||
    lc.includes('mobile developer') ||
    lc.includes('web developer')
  ) {
    return { functionName: 'Tech', roleName: 'SDE-1' };
  }
  if (lc.includes('product manager') || lc.includes('project manager')) {
    return { functionName: 'CSM', roleName: 'Customer Success Manager' };
  }
  if (lc === 'design' || lc.includes('design')) {
    return { functionName: 'Design', roleName: 'Product Designer' };
  }
  if (lc === 'hr') {
    return { functionName: 'HR', roleName: 'HR Manager' };
  }
  if (lc === 'accounts') {
    return { functionName: 'Finance', roleName: 'Accountant' };
  }
  if (lc === 'consultant') {
    return { functionName: 'Growth', roleName: 'Consultant' };
  }
  if (lc === 'content') {
    return { functionName: 'Growth', roleName: 'Consultant' };
  }
  if (lc.includes('founder office')) {
    return { functionName: 'Growth', roleName: 'Managing Partner' };
  }
  if (lc === 'growth' || lc.includes('growth')) {
    return { functionName: 'Growth', roleName: 'Consultant' };
  }

  // Fallback
  return { functionName: 'Tech', roleName: 'SDE-1' };
}

// ---------------------------------------------------------------------------
// System Role mapping
// ---------------------------------------------------------------------------
function mapAccessRole(accessRole: string): SystemRole {
  const v = (accessRole ?? '').toLowerCase().trim();
  switch (v) {
    case 'admin':
      return 'ADMIN';
    case 'pod_lead':
      return 'POD_LEAD';
    case 'pm':
      return 'CSM';
    case 'growth':
    case 'employee':
    case 'hr':
    case 'aws':
    default:
      return 'EMPLOYEE';
  }
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------
function mapStatus(isArchived: string): EmployeeStatus {
  return (isArchived ?? '').toLowerCase() === 'yes' ? 'RESIGNED' : 'ACTIVE';
}

// ---------------------------------------------------------------------------
// Pod lead name → pod name mapping
// ---------------------------------------------------------------------------
function resolvePodName(performanceManager: string): string {
  const pm = (performanceManager ?? '').trim().toLowerCase();

  if (!pm) return 'CEO Pod';

  // CEO Pod reporters
  if (
    pm.startsWith('pushpal') ||
    pm === 'yz' ||
    pm.startsWith('brijesh agarwal') ||
    pm.startsWith('brijesh')
  ) {
    return 'CEO Pod';
  }

  if (pm.startsWith('aditya pasikanti') || pm === 'aditya') return 'Intent';
  if (pm.startsWith('ayushya patel') || pm === 'ayushya patel') return 'Apex';
  if (pm.startsWith('bhagyashree')) return 'Sudoers';
  if (pm.startsWith('dharmik')) return 'Strikex';
  if (pm.startsWith('jaimin malaviya')) return 'Pixel';
  if (pm.startsWith('karan') || pm.startsWith('karan desai')) return 'Fynd and Furious';
  if (pm.startsWith('nishant nath')) return 'Uptime Syndicate';
  if (pm.startsWith('piyush')) return 'Ping Pod';
  if (pm.startsWith('shruti')) return 'Mobilizers';
  if (pm.startsWith('vasu') || pm.startsWith('vasu chapadia')) return 'Atlas';
  if (pm.startsWith('amit prajapati')) return 'Bug Busters';
  if (pm.startsWith('bhavya joshi') || pm.startsWith('bhavya')) return 'Morphe';

  // Any unknown PM → CEO Pod
  return 'CEO Pod';
}

// ---------------------------------------------------------------------------
// Platform assignment from CSV row
// ---------------------------------------------------------------------------
function resolvePlatforms(csvRole: string, accessRole: string): string[] {
  const platforms: string[] = [];
  const primary = (csvRole.split(';')[0] ?? '').trim().toLowerCase();

  if (primary === 'shopify developer') platforms.push('Shopify');
  if (primary === 'fynd') platforms.push('Fynd');
  if ((accessRole ?? '').toLowerCase().trim() === 'aws') platforms.push('AWS');

  return platforms;
}

// ---------------------------------------------------------------------------
// Skip rules
// ---------------------------------------------------------------------------
const SKIP_EMAILS = new Set([
  'test@yopmail.com',
  'test@devxlabs.ai',
  'leaves@devxlabs.ai',
  'test@devxlabs.ai',
]);

function shouldSkip(row: Record<string, string>): boolean {
  const email = (row['Email'] ?? '').toLowerCase().trim();
  if (SKIP_EMAILS.has(email)) return true;
  if ((row['Seniority'] ?? '').toUpperCase() === 'DEVX_ACADEMY') return true;
  if (!email || !email.includes('@')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Deterministic UUID from email (so re-runs produce same IDs)
// ---------------------------------------------------------------------------
function deterministicUUID(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  // Format as UUID v4-ish (we just need a stable UUID for google_id placeholder)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Starting employee seed...\n');

  // ── 1. Functions ──────────────────────────────────────────────────────────
  const functionNames = ['Tech', 'Design', 'CSM', 'Growth', 'Finance', 'HR'];
  const functionMap: Record<string, string> = {}; // name → id

  for (const name of functionNames) {
    const fn = await prisma.functions.upsert({
      where: { name },
      update: {},
      create: { id: crypto.randomUUID(), name },
    });
    functionMap[name] = fn.id;
  }
  console.log(`[1/6] Functions: ${functionNames.join(', ')}`);

  // ── 2. Roles ──────────────────────────────────────────────────────────────
  const rolesByFunction: Record<string, string[]> = {
    Tech: [
      'AI Engineer',
      'Senior AI Engineer',
      'AI Lead',
      'SDE-1',
      'SDE-2',
      'SDE-3',
      'DevOps Engineer',
      'Senior DevOps Engineer',
      'Solution Architect',
      'DevOps Lead',
      'Engineering Manager',
      'Junior QA',
      'Senior QA',
      'QA Lead',
      'Data Engineer',
      'Senior Data Engineer',
      'Data Engineering Lead',
      'AI Intern',
      'SDE Intern',
      'DevOps Intern',
      'QA Intern',
      'CTO',
    ],
    CSM: ['Customer Success Manager', 'Customer Success Lead'],
    HR: ['HR Intern', 'HR Manager', 'HR Lead'],
    Design: ['Design Intern', 'Product Designer', 'Senior Product Designer'],
    Finance: ['Finance Analyst', 'CFO', 'Accountant'],
    Growth: [
      'Consultant',
      'Managing Partner',
      'Cloud Practice Lead',
      'Data Practice Lead',
      'Commerce Practice Lead',
      'Cloud Analyst',
      'Data Analyst',
      'Commerce Analyst',
      'AI Practice Lead',
      'AI Analyst',
    ],
  };

  // roleMap: "FunctionName::RoleName" → role_id
  const roleMap: Record<string, string> = {};
  let roleCount = 0;

  for (const [fnName, roles] of Object.entries(rolesByFunction)) {
    const fnId = functionMap[fnName];
    for (const roleName of roles) {
      const role = await prisma.roles.upsert({
        where: { name_function_id: { name: roleName, function_id: fnId } },
        update: {},
        create: { id: crypto.randomUUID(), name: roleName, function_id: fnId },
      });
      roleMap[`${fnName}::${roleName}`] = role.id;
      roleCount++;
    }
  }
  console.log(`[2/6] Roles: ${roleCount} total`);

  // ── 3. Platforms ──────────────────────────────────────────────────────────
  const platformNames = ['Shopify', 'Fynd', 'Medusa', 'AWS', 'GCP'];
  const platformMap: Record<string, string> = {}; // name → id

  for (const name of platformNames) {
    const p = await prisma.platforms.upsert({
      where: { name },
      update: {},
      create: { id: crypto.randomUUID(), name },
    });
    platformMap[name] = p.id;
  }
  console.log(`[3/6] Platforms: ${platformNames.join(', ')}`);

  // ── 4. Parse CSV ──────────────────────────────────────────────────────────
  // Locate the CSV — try a few likely paths
  const csvCandidates = [
    '/Users/apple/Downloads/employees-export-2026-02-20.csv',
    path.join(__dirname, '../../../../employees-export-2026-02-20.csv'),
    path.join(process.cwd(), 'employees-export-2026-02-20.csv'),
  ];

  let csvPath = '';
  for (const candidate of csvCandidates) {
    if (fs.existsSync(candidate)) {
      csvPath = candidate;
      break;
    }
  }

  if (!csvPath) {
    throw new Error(
      'CSV file not found. Expected at: ' + csvCandidates[0]
    );
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  console.log(`[4/6] CSV parsed: ${rows.length} rows`);

  // ── 5. Seed pods with placeholder lead IDs (two-pass approach) ───────────
  // Pod definitions based on known pod leads
  const podLeadEmails: Record<string, string> = {
    'Intent':             'aditya.pasikanti@devxlabs.ai',
    'Apex':               'ayushya.patel@devxlabs.ai',
    'Sudoers':            'bhagyashree@devxlabs.ai',
    'Strikex':            'dharmik@devxlabs.ai',
    'Pixel':             'jaimin.malaviya@devxlabs.ai',
    'Fynd and Furious':   'karan.desai@devxlabs.ai',
    'Uptime Syndicate':   'nishant.nath@devxlabs.ai',
    'Ping Pod':           'piyush@devxlabs.ai',
    'Mobilizers':         'shruti@devxlabs.ai',
    'Atlas':              'vasu.chapadia@devxlabs.ai',
    'Bug Busters':        'amit.prajapati@devxlabs.ai',
    'Morphe':             'bhavya.joshi@devxlabs.ai',
    'CEO Pod':            'pushpal@devxlabs.ai',
  };

  // ── 6. First pass: upsert all employees (without pod assignment) ──────────
  console.log('\n[5/6] Upserting employees...');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  // We need two sub-passes:
  // Pass A: upsert all employee records
  // Pass B: upsert pods (need lead employee IDs), then assign pod_id to members

  const validRows = rows.filter((row) => !shouldSkip(row));
  console.log(`       ${rows.length - validRows.length} rows skipped (test/academy accounts)`);

  // Pass A — upsert employees without pod_id
  for (const row of validRows) {
    const email = (row['Email'] ?? '').toLowerCase().trim();
    const name = (row['Name'] ?? '').trim();
    const csvRoles = (row['Roles'] ?? '').trim();
    const accessRole = (row['Access Role'] ?? '').trim();
    const isArchived = (row['Is Archived'] ?? '').trim();
    const joiningDateStr = (row['Joining Date'] ?? '').trim();

    if (!email || !name) {
      skipped++;
      continue;
    }

    // Derive function + role
    const { functionName, roleName } = mapCsvRole(csvRoles);
    const fnId = functionMap[functionName];
    const roleId = roleMap[`${functionName}::${roleName}`];

    if (!fnId || !roleId) {
      console.warn(`  WARN: Could not resolve function/role for "${name}" (${email}) — roles="${csvRoles}"`);
      errors++;
      continue;
    }

    const systemRole = mapAccessRole(accessRole);
    const status = mapStatus(isArchived);

    let joiningDate: Date | undefined;
    if (joiningDateStr) {
      const d = new Date(joiningDateStr);
      if (!isNaN(d.getTime())) joiningDate = d;
    }

    // Use a deterministic google_id placeholder so upserts are idempotent
    // Real google_id will be set on first Google OAuth login (NextAuth)
    const googleId = deterministicUUID(email);

    try {
      // Check if the employee already exists with a promoted role.
      // If so, do NOT overwrite their system_role — manual promotions
      // done via the admin UI must survive re-seeds.
      const existing = await prisma.employees.findUnique({
        where: { email },
        select: { system_role: true },
      });
      const preservedRoles: SystemRole[] = ['ADMIN', 'POD_LEAD', 'CSM'];
      const shouldPreserveRole =
        existing && preservedRoles.includes(existing.system_role as SystemRole);

      await prisma.employees.upsert({
        where: { email },
        update: {
          name,
          function_id: fnId,
          role_id: roleId,
          // Only overwrite system_role if the existing role is plain EMPLOYEE
          // (or this is a new record). Promoted roles are preserved.
          ...(!shouldPreserveRole ? { system_role: systemRole } : {}),
          status,
          ...(joiningDate ? { joining_date: joiningDate } : {}),
        },
        create: {
          id: crypto.randomUUID(),
          google_id: googleId,
          email,
          name,
          function_id: fnId,
          role_id: roleId,
          system_role: systemRole,
          status,
          ...(joiningDate ? { joining_date: joiningDate } : {}),
        },
      });
      created++;
    } catch (err: any) {
      console.error(`  ERROR upserting ${email}: ${err.message}`);
      errors++;
    }
  }
  console.log(`       Employees upserted: ${created}, errors: ${errors}`);

  // Pass B — upsert pods (requires lead employee records to exist)
  console.log('\n[6/6] Upserting pods...');

  const podMap: Record<string, string> = {}; // pod name → pod id

  for (const [podName, leadEmail] of Object.entries(podLeadEmails)) {
    // Find the lead employee
    const lead = await prisma.employees.findUnique({ where: { email: leadEmail } });
    if (!lead) {
      console.warn(`  WARN: Pod lead not found for "${podName}" (${leadEmail}) — skipping pod`);
      continue;
    }

    try {
      // Check if this lead already leads another pod
      const existingPod = await prisma.pods.findFirst({
        where: { lead_id: lead.id },
      });

      if (existingPod) {
        // Update name if needed, register in map
        const updated = await prisma.pods.update({
          where: { id: existingPod.id },
          data: { name: podName },
        });
        podMap[podName] = updated.id;
      } else {
        // Upsert by name
        const pod = await prisma.pods.upsert({
          where: { name: podName },
          update: { lead_id: lead.id },
          create: {
            id: crypto.randomUUID(),
            name: podName,
            lead_id: lead.id,
          },
        });
        podMap[podName] = pod.id;
      }

      // Ensure the lead employee has the POD_LEAD system_role
      await prisma.employees.update({
        where: { id: lead.id },
        data: { pod_id: podMap[podName] },
      });

      console.log(`  Pod "${podName}" → lead: ${lead.name}`);
    } catch (err: any) {
      console.error(`  ERROR upserting pod "${podName}": ${err.message}`);
    }
  }

  // Pass C — assign pod_id to each employee based on Performance Manager
  console.log('\nAssigning pod memberships...');
  let podAssigned = 0;
  let podMissed = 0;

  for (const row of validRows) {
    const email = (row['Email'] ?? '').toLowerCase().trim();
    if (!email) continue;

    const performanceManager = (row['Performance Manager Name'] ?? '').trim();
    const podName = resolvePodName(performanceManager);
    const podId = podMap[podName];

    if (!podId) {
      podMissed++;
      continue;
    }

    const employee = await prisma.employees.findUnique({ where: { email } });
    if (!employee) continue;

    // Skip if already set to the correct pod (idempotent)
    if (employee.pod_id === podId) {
      podAssigned++;
      continue;
    }

    await prisma.employees.update({
      where: { id: employee.id },
      data: { pod_id: podId },
    });
    podAssigned++;
  }
  console.log(`  Pod assignments: ${podAssigned} set, ${podMissed} pods not found`);

  // Pass D — assign platforms to employees
  console.log('\nAssigning platforms...');
  let platformsAssigned = 0;

  for (const row of validRows) {
    const email = (row['Email'] ?? '').toLowerCase().trim();
    if (!email) continue;

    const csvRoles = (row['Roles'] ?? '').trim();
    const accessRole = (row['Access Role'] ?? '').trim();
    const platforms = resolvePlatforms(csvRoles, accessRole);

    if (platforms.length === 0) continue;

    const employee = await prisma.employees.findUnique({ where: { email } });
    if (!employee) continue;

    for (const platformName of platforms) {
      const platformId = platformMap[platformName];
      if (!platformId) continue;

      await prisma.employee_platforms.upsert({
        where: {
          employee_id_platform_id: {
            employee_id: employee.id,
            platform_id: platformId,
          },
        },
        update: {},
        create: {
          id: crypto.randomUUID(),
          employee_id: employee.id,
          platform_id: platformId,
        },
      });
      platformsAssigned++;
    }
  }
  console.log(`  Platform assignments: ${platformsAssigned}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalEmployees = await prisma.employees.count();
  const totalPods = await prisma.pods.count();
  const totalPlatformAssignments = await prisma.employee_platforms.count();

  console.log('\n========================================');
  console.log('Seed complete.');
  console.log(`  Total employees in DB : ${totalEmployees}`);
  console.log(`  Total pods in DB      : ${totalPods}`);
  console.log(`  Platform assignments  : ${totalPlatformAssignments}`);
  console.log('========================================\n');
  console.log('NOTE: google_id fields are set to deterministic placeholders.');
  console.log('They will be overwritten with real Google IDs on first OAuth login.');
}

main()
  .catch((e) => {
    console.error('\nSeed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
