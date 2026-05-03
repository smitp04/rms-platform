import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

// Generate 26 bi-weekly sprints for a given year starting from Jan 1
function generateSprintsForYear(year: number) {
  const sprints = [];
  let start = new Date(`${year}-01-01`);

  // Align to nearest Monday
  const day = start.getDay();
  if (day !== 1) {
    const offset = day === 0 ? 1 : 8 - day;
    start = new Date(start.getTime() + offset * 86400000);
  }

  for (let i = 1; i <= 26; i++) {
    const end = new Date(start.getTime() + 13 * 86400000); // 14 days, end = day 13
    sprints.push({
      sprint_number: i,
      year,
      start_date: new Date(start),
      end_date: end,
      label: `S${i}-${year}`,
    });
    start = new Date(end.getTime() + 86400000); // next sprint starts day after
  }
  return sprints;
}

async function main() {
  console.log('🌱 Seeding database...');

  // ── Functions ──────────────────────────────────────────────────────────────
  const functions = [
    'Tech',
    'Customer Success',
    'HR',
    'Finance',
    'Growth',
    'Design',
  ];

  const createdFunctions: Record<string, string> = {};
  for (const name of functions) {
    const fn = await prisma.functions.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    createdFunctions[name] = fn.id;
  }
  console.log(`✓ ${functions.length} functions seeded`);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const rolesByFunction: Record<string, string[]> = {
    Tech: [
      'AI Engineer',
      'Senior AI Engineer',
      'AI Lead',
      'SDE-1',
      'SDE-2',
      'SDE-3',
      'Devops Engineer',
      'Senior Devops Engineer',
      'Solution Architect',
      'Devops Lead',
      'Engineering Manager',
      'Junior QA',
      'Senior QA',
      'QA Lead',
      'Data Engineer',
      'Senior Data Engineer',
      'Data Engineering Lead',
      'AI Intern',
      'SDE Intern',
      'Devops Intern',
      'QA Intern',
      'CTO',
    ],
    'Customer Success': ['Customer Success Manager', 'Customer Success Lead'],
    HR: ['HR Intern', 'HR Manager', 'HR Lead'],
    Finance: ['Finance Analyst', 'CFO', 'Accountant'],
    Growth: [
      'Consultant',
      'Managing Partner',
      'Cloud Practice Lead',
      'Data Practice Lead',
      'Commerce Practice Lead',
      'AI Practice Lead',
      'Cloud Analyst',
      'Data Analyst',
      'Commerce Analyst',
      'AI Analyst',
    ],
    Design: ['Design Intern', 'Product Designer', 'Senior Product Designer'],
  };

  let roleCount = 0;
  for (const [functionName, roles] of Object.entries(rolesByFunction)) {
    const functionId = createdFunctions[functionName];
    for (const roleName of roles) {
      await prisma.roles.upsert({
        where: { name_function_id: { name: roleName, function_id: functionId } },
        update: {},
        create: { name: roleName, function_id: functionId },
      });
      roleCount++;
    }
  }
  console.log(`✓ ${roleCount} roles seeded`);

  // ── Platforms ──────────────────────────────────────────────────────────────
  const platforms = ['Shopify', 'Fynd', 'Medusa', 'AWS', 'GCP'];
  for (const name of platforms) {
    await prisma.platforms.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`✓ ${platforms.length} platforms seeded`);

  // ── Sprints (2024, 2025, 2026) ────────────────────────────────────────────
  let sprintCount = 0;
  for (const year of [2024, 2025, 2026]) {
    const sprints = generateSprintsForYear(year);
    for (const sprint of sprints) {
      await prisma.rms_sprints.upsert({
        where: { sprint_number_year: { sprint_number: sprint.sprint_number, year: sprint.year } },
        update: {},
        create: sprint,
      });
      sprintCount++;
    }
  }
  console.log(`✓ ${sprintCount} sprints seeded (2024–2026)`);

  // ── Admin employee ─────────────────────────────────────────────────────────
  // This is a placeholder — replace google_id and email with actual CEO details
  const growthFunctionId = createdFunctions['Growth'];
  const ceoRole = await prisma.roles.findFirst({
    where: { name: 'CEO', function_id: growthFunctionId },
  });

  if (ceoRole) {
    await prisma.employees.upsert({
      where: { email: 'pushpal@devxlabs.ai' },
      update: {},
      create: {
        google_id: 'REPLACE_WITH_GOOGLE_ID',
        email: 'pushpal@devxlabs.ai',
        name: 'Pushpal',
        function_id: growthFunctionId,
        role_id: ceoRole.id,
        system_role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log('✓ Admin (CEO) employee seeded — update google_id and email after setup');
  }

  console.log('\n✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
