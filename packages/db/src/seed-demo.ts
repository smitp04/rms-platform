/**
 * seed-demo.ts
 *
 * Populates the database with realistic demo data:
 *  - 55 employees across all functions
 *  - 8 pods with pod leads
 *  - 22 accounts + 27 projects across all statuses / pillars
 *  - Sprint allocations for 2025 sprints S1–S18 (covering ~9 months)
 *
 * Run with:
 *   pnpm --filter @devx/db db:seed-demo
 *
 * Idempotent — safe to run multiple times.
 */

import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

function cents(dollars: number) {
  return Math.round(dollars * 100);
}

// Fake stable google_ids for demo employees
function googleId(n: number) {
  return `DEMO_GOOGLE_ID_${String(n).padStart(5, '0')}`;
}

async function main() {
  console.log('\n🌱 Seeding DEMO data...\n');

  // ── 1. Load existing lookup data ────────────────────────────────────────────

  const allFunctions = await prisma.functions.findMany();
  const allRoles = await prisma.roles.findMany({
    include: { function: true },
  });
  const allPlatforms = await prisma.platforms.findMany();
  const allSprints2025 = await prisma.rms_sprints.findMany({
    where: { year: 2025 },
    orderBy: [{ sprint_number: 'asc' }],
  });
  const allSprints2026 = await prisma.rms_sprints.findMany({
    where: { year: 2026 },
    orderBy: [{ sprint_number: 'asc' }],
  });

  const fnMap: Record<string, string> = Object.fromEntries(
    allFunctions.map((f) => [f.name, f.id])
  );
  const roleMap: Record<string, string> = Object.fromEntries(
    allRoles.map((r) => [`${r.function.name}::${r.name}`, r.id])
  );
  const platformMap: Record<string, string> = Object.fromEntries(
    allPlatforms.map((p) => [p.name, p.id])
  );

  // Sprints S1–S18 of 2025 and S1–S6 of 2026 for allocations
  const activeSprints2025 = allSprints2025.filter((s) => s.sprint_number <= 18);
  const activeSprints2026 = allSprints2026.filter((s) => s.sprint_number <= 6);
  const allActiveSprints = [...activeSprints2025, ...activeSprints2026];

  console.log(`  Loaded ${allFunctions.length} functions, ${allRoles.length} roles, ${allSprints2025.length} 2025 sprints, ${allSprints2026.length} 2026 sprints`);

  // ── 2. Employees ─────────────────────────────────────────────────────────────

  type EmpDef = {
    n: number;
    name: string;
    email: string;
    fn: string;
    role: string;
    salary: number;
    systemRole?: 'ADMIN' | 'POD_LEAD' | 'CSM' | 'EMPLOYEE';
    platforms?: string[];
  };

  const employeeDefs: EmpDef[] = [
    // ── Tech — AI / ML ───────────────────────────────────────────────────────
    { n: 1,  name: 'Arjun Mehta',         email: 'arjun.mehta@devxlabs.ai',         fn: 'Tech', role: 'Senior AI Engineer',       salary: 140000, platforms: ['AWS', 'GCP'] },
    { n: 2,  name: 'Priya Sharma',        email: 'priya.sharma@devxlabs.ai',        fn: 'Tech', role: 'AI Lead',                   salary: 160000, platforms: ['AWS'],           systemRole: 'POD_LEAD' },
    { n: 5,  name: 'Kiran Nair',          email: 'kiran.nair@devxlabs.ai',          fn: 'Tech', role: 'AI Engineer',               salary: 120000, platforms: ['GCP'] },
    { n: 13, name: 'Ishaan Choudhary',    email: 'ishaan.choudhary@devxlabs.ai',    fn: 'Tech', role: 'AI Engineer',               salary: 122000, platforms: ['AWS'] },
    { n: 29, name: 'Namrata Kulkarni',    email: 'namrata.kulkarni@devxlabs.ai',    fn: 'Tech', role: 'Senior AI Engineer',        salary: 145000, platforms: ['AWS', 'GCP'] },
    { n: 33, name: 'Farhan Qureshi',      email: 'farhan.qureshi@devxlabs.ai',      fn: 'Tech', role: 'AI Engineer',               salary: 118000, platforms: ['GCP'] },
    { n: 34, name: 'Swati Desai',         email: 'swati.desai@devxlabs.ai',         fn: 'Tech', role: 'Senior AI Engineer',        salary: 138000, platforms: ['AWS'] },
    { n: 35, name: 'Aman Tripathi',       email: 'aman.tripathi@devxlabs.ai',       fn: 'Tech', role: 'AI Intern',                 salary: 36000,  platforms: ['GCP'] },

    // ── Tech — SDE ───────────────────────────────────────────────────────────
    { n: 3,  name: 'Rohan Kapoor',        email: 'rohan.kapoor@devxlabs.ai',        fn: 'Tech', role: 'SDE - 2',                   salary: 110000, platforms: ['Shopify'] },
    { n: 4,  name: 'Neha Patel',          email: 'neha.patel@devxlabs.ai',          fn: 'Tech', role: 'SDE - 3',                   salary: 130000, platforms: ['Shopify', 'Fynd'] },
    { n: 6,  name: 'Siddharth Rao',       email: 'siddharth.rao@devxlabs.ai',       fn: 'Tech', role: 'SDE - 1',                   salary: 90000,  platforms: ['Medusa'] },
    { n: 12, name: 'Rahul Mishra',        email: 'rahul.mishra@devxlabs.ai',        fn: 'Tech', role: 'SDE - 2',                   salary: 108000, platforms: ['Shopify', 'AWS'] },
    { n: 28, name: 'Raj Subramaniam',     email: 'raj.subramaniam@devxlabs.ai',     fn: 'Tech', role: 'SDE - 3',                   salary: 132000, platforms: ['Shopify', 'Medusa'], systemRole: 'POD_LEAD' },
    { n: 32, name: 'Aarav Malhotra',      email: 'aarav.malhotra@devxlabs.ai',      fn: 'Tech', role: 'SDE - 1',                   salary: 88000,  platforms: ['Fynd'] },
    { n: 36, name: 'Pallavi Gupta',       email: 'pallavi.gupta@devxlabs.ai',       fn: 'Tech', role: 'SDE - 2',                   salary: 112000, platforms: ['Shopify', 'Medusa'] },
    { n: 37, name: 'Nitin Joshi',         email: 'nitin.joshi@devxlabs.ai',         fn: 'Tech', role: 'SDE - 3',                   salary: 128000, platforms: ['Fynd', 'AWS'] },
    { n: 38, name: 'Shreya Nambiar',      email: 'shreya.nambiar@devxlabs.ai',      fn: 'Tech', role: 'SDE - 1',                   salary: 86000,  platforms: ['Shopify'] },
    { n: 39, name: 'Harish Menon',        email: 'harish.menon@devxlabs.ai',        fn: 'Tech', role: 'SDE Intern',                salary: 32000,  platforms: ['Shopify'] },

    // ── Tech — Devops / Infra ────────────────────────────────────────────────
    { n: 7,  name: 'Ananya Joshi',        email: 'ananya.joshi@devxlabs.ai',        fn: 'Tech', role: 'Devops Engineer',           salary: 115000, platforms: ['AWS', 'GCP'] },
    { n: 8,  name: 'Vikram Singh',        email: 'vikram.singh@devxlabs.ai',        fn: 'Tech', role: 'Senior Devops Engineer',    salary: 135000, platforms: ['AWS'] },
    { n: 31, name: 'Tanya Bhatt',         email: 'tanya.bhatt@devxlabs.ai',         fn: 'Tech', role: 'Devops Lead',               salary: 142000, platforms: ['AWS'],           systemRole: 'POD_LEAD' },
    { n: 40, name: 'Kabir Saxena',        email: 'kabir.saxena@devxlabs.ai',        fn: 'Tech', role: 'Devops Engineer',           salary: 113000, platforms: ['GCP', 'AWS'] },
    { n: 41, name: 'Deepika Rao',         email: 'deepika.rao@devxlabs.ai',         fn: 'Tech', role: 'Devops Intern',             salary: 30000,  platforms: ['AWS'] },

    // ── Tech — Data ──────────────────────────────────────────────────────────
    { n: 9,  name: 'Meera Krishnan',      email: 'meera.krishnan@devxlabs.ai',      fn: 'Tech', role: 'Data Engineer',             salary: 118000, platforms: ['GCP'] },
    { n: 30, name: 'Omar Sheikh',         email: 'omar.sheikh@devxlabs.ai',         fn: 'Tech', role: 'Data Engineer',             salary: 116000, platforms: ['GCP', 'AWS'] },
    { n: 42, name: 'Vanya Aggarwal',      email: 'vanya.aggarwal@devxlabs.ai',      fn: 'Tech', role: 'Senior Data Engineer',      salary: 136000, platforms: ['GCP', 'AWS'] },

    // ── Tech — Architecture / Management ─────────────────────────────────────
    { n: 10, name: 'Akash Gupta',         email: 'akash.gupta@devxlabs.ai',         fn: 'Tech', role: 'Engineering Manager',       salary: 175000, platforms: ['AWS', 'GCP'],    systemRole: 'POD_LEAD' },
    { n: 14, name: 'Divya Menon',         email: 'divya.menon@devxlabs.ai',         fn: 'Tech', role: 'Solution Architect',        salary: 165000, platforms: ['AWS', 'GCP'],    systemRole: 'POD_LEAD' },
    { n: 43, name: 'Rishabh Chandra',     email: 'rishabh.chandra@devxlabs.ai',     fn: 'Tech', role: 'Solution Architect',        salary: 162000, platforms: ['AWS'],           systemRole: 'POD_LEAD' },

    // ── Tech — QA ────────────────────────────────────────────────────────────
    { n: 11, name: 'Pooja Verma',         email: 'pooja.verma@devxlabs.ai',         fn: 'Tech', role: 'Senior QA',                 salary: 100000, platforms: ['Shopify'] },
    { n: 44, name: 'Mihir Batra',         email: 'mihir.batra@devxlabs.ai',         fn: 'Tech', role: 'Junior QA',                 salary: 78000 },
    { n: 45, name: 'Sonal Mathur',        email: 'sonal.mathur@devxlabs.ai',        fn: 'Tech', role: 'QA Lead',                   salary: 115000 },

    // ── Customer Success ─────────────────────────────────────────────────────
    { n: 15, name: 'Kavya Reddy',         email: 'kavya.reddy@devxlabs.ai',         fn: 'Customer Success', role: 'Customer Success Manager', salary: 95000,  systemRole: 'CSM' },
    { n: 16, name: 'Aditya Bose',         email: 'aditya.bose@devxlabs.ai',         fn: 'Customer Success', role: 'Customer Success Lead',    salary: 115000, systemRole: 'CSM' },
    { n: 17, name: 'Ritu Agarwal',        email: 'ritu.agarwal@devxlabs.ai',        fn: 'Customer Success', role: 'Customer Success Manager', salary: 92000,  systemRole: 'CSM' },
    { n: 46, name: 'Megha Pillai',        email: 'megha.pillai@devxlabs.ai',        fn: 'Customer Success', role: 'Customer Success Manager', salary: 90000,  systemRole: 'CSM' },
    { n: 47, name: 'Sachin Dewan',        email: 'sachin.dewan@devxlabs.ai',        fn: 'Customer Success', role: 'Customer Success Manager', salary: 93000,  systemRole: 'CSM' },

    // ── Growth ───────────────────────────────────────────────────────────────
    { n: 18, name: 'Sumit Khanna',        email: 'sumit.khanna@devxlabs.ai',        fn: 'Growth', role: 'Consultant',              salary: 105000 },
    { n: 19, name: 'Leela Chakraborty',   email: 'leela.chakraborty@devxlabs.ai',   fn: 'Growth', role: 'Engagement Manager',       salary: 130000, systemRole: 'POD_LEAD' },
    { n: 20, name: 'Tanish Malhotra',     email: 'tanish.malhotra@devxlabs.ai',     fn: 'Growth', role: 'Partner',                  salary: 180000 },
    { n: 21, name: 'Shreya Iyer',         email: 'shreya.iyer@devxlabs.ai',         fn: 'Growth', role: 'Cloud Practice Lead',      salary: 155000 },
    { n: 22, name: 'Dev Srivastava',      email: 'dev.srivastava@devxlabs.ai',      fn: 'Growth', role: 'Commerce Analyst',         salary: 88000 },
    { n: 48, name: 'Ritika Sharma',       email: 'ritika.sharma@devxlabs.ai',       fn: 'Growth', role: 'AI Practice Lead',         salary: 150000 },
    { n: 49, name: 'Varun Oberoi',        email: 'varun.oberoi@devxlabs.ai',        fn: 'Growth', role: 'Data Analyst',             salary: 82000 },
    { n: 50, name: 'Ankit Mehrotra',      email: 'ankit.mehrotra@devxlabs.ai',      fn: 'Growth', role: 'Commerce Practice Lead',   salary: 148000 },

    // ── Design ───────────────────────────────────────────────────────────────
    { n: 23, name: 'Aisha Khan',          email: 'aisha.khan@devxlabs.ai',          fn: 'Design', role: 'Senior Product Designer',  salary: 112000 },
    { n: 24, name: 'Nikhil Tiwari',       email: 'nikhil.tiwari@devxlabs.ai',       fn: 'Design', role: 'Product Designer',          salary: 90000 },
    { n: 51, name: 'Zara Ahmed',          email: 'zara.ahmed@devxlabs.ai',          fn: 'Design', role: 'Product Designer',          salary: 88000 },
    { n: 52, name: 'Ravi Suresh',         email: 'ravi.suresh@devxlabs.ai',         fn: 'Design', role: 'Design Intern',             salary: 28000 },

    // ── HR ───────────────────────────────────────────────────────────────────
    { n: 25, name: 'Preeti Saxena',       email: 'preeti.saxena@devxlabs.ai',       fn: 'HR', role: 'HR Manager',     salary: 85000 },
    { n: 26, name: 'Gaurav Pillai',       email: 'gaurav.pillai@devxlabs.ai',       fn: 'HR', role: 'HR Lead',        salary: 100000 },
    { n: 53, name: 'Komal Bansal',        email: 'komal.bansal@devxlabs.ai',        fn: 'HR', role: 'HR Intern',      salary: 26000 },

    // ── Finance ──────────────────────────────────────────────────────────────
    { n: 27, name: 'Sanjana Dutta',       email: 'sanjana.dutta@devxlabs.ai',       fn: 'Finance', role: 'Finance Analyst',  salary: 92000 },
    { n: 54, name: 'Neeraj Kapoor',       email: 'neeraj.kapoor@devxlabs.ai',       fn: 'Finance', role: 'Accountant',        salary: 72000 },
    { n: 55, name: 'Chitra Iyer',         email: 'chitra.iyer@devxlabs.ai',         fn: 'Finance', role: 'CFO',               salary: 220000 },
  ];

  const empIdMap: Record<string, string> = {}; // email → db id

  for (const def of employeeDefs) {
    const fnId = fnMap[def.fn];
    const roleId = roleMap[`${def.fn}::${def.role}`];
    if (!fnId || !roleId) {
      console.warn(`  ⚠ Skipping ${def.name}: missing function/role (${def.fn}::${def.role})`);
      continue;
    }

    // Safe upsert: find by email OR google_id to avoid unique constraint conflicts
    const gid = googleId(def.n);
    let emp = await prisma.employees.findFirst({ where: { email: def.email } });
    if (!emp) emp = await prisma.employees.findFirst({ where: { google_id: gid } });
    if (emp) {
      emp = await prisma.employees.update({
        where: { id: emp.id },
        data: {
          google_id: gid,
          email: def.email,
          name: def.name,
          salary_ctc_cents: cents(def.salary),
          function_id: fnId,
          role_id: roleId,
          system_role: def.systemRole ?? 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
    } else {
      emp = await prisma.employees.create({
        data: {
          google_id: gid,
          email: def.email,
          name: def.name,
          function_id: fnId,
          role_id: roleId,
          system_role: def.systemRole ?? 'EMPLOYEE',
          status: 'ACTIVE',
          salary_ctc_cents: cents(def.salary),
        },
      });
    }
    empIdMap[def.email] = emp.id;

    // Platforms
    if (def.platforms) {
      for (const pname of def.platforms) {
        const pid = platformMap[pname];
        if (!pid) continue;
        await prisma.employee_platforms.upsert({
          where: { employee_id_platform_id: { employee_id: emp.id, platform_id: pid } },
          update: {},
          create: { employee_id: emp.id, platform_id: pid },
        });
      }
    }
  }
  console.log(`✓ ${Object.keys(empIdMap).length} demo employees upserted`);

  // ── 3. Pods ──────────────────────────────────────────────────────────────────

  const podDefs = [
    {
      name: 'Pod Alpha',
      leadEmail: 'akash.gupta@devxlabs.ai',
      memberEmails: ['arjun.mehta@devxlabs.ai', 'priya.sharma@devxlabs.ai', 'kiran.nair@devxlabs.ai', 'pooja.verma@devxlabs.ai', 'farhan.qureshi@devxlabs.ai'],
    },
    {
      name: 'Pod Beta',
      leadEmail: 'divya.menon@devxlabs.ai',
      memberEmails: ['rohan.kapoor@devxlabs.ai', 'neha.patel@devxlabs.ai', 'siddharth.rao@devxlabs.ai', 'meera.krishnan@devxlabs.ai', 'vanya.aggarwal@devxlabs.ai'],
    },
    {
      name: 'Pod Gamma',
      leadEmail: 'raj.subramaniam@devxlabs.ai',
      memberEmails: ['rahul.mishra@devxlabs.ai', 'ishaan.choudhary@devxlabs.ai', 'aisha.khan@devxlabs.ai', 'nikhil.tiwari@devxlabs.ai', 'pallavi.gupta@devxlabs.ai'],
    },
    {
      name: 'Pod Delta',
      leadEmail: 'tanya.bhatt@devxlabs.ai',
      memberEmails: ['ananya.joshi@devxlabs.ai', 'vikram.singh@devxlabs.ai', 'namrata.kulkarni@devxlabs.ai', 'omar.sheikh@devxlabs.ai', 'kabir.saxena@devxlabs.ai'],
    },
    {
      name: 'Pod Epsilon',
      leadEmail: 'priya.sharma@devxlabs.ai',
      memberEmails: ['aarav.malhotra@devxlabs.ai', 'sumit.khanna@devxlabs.ai', 'dev.srivastava@devxlabs.ai', 'swati.desai@devxlabs.ai', 'nitin.joshi@devxlabs.ai'],
    },
    {
      name: 'Pod Zeta',
      leadEmail: 'leela.chakraborty@devxlabs.ai',
      memberEmails: ['gaurav.pillai@devxlabs.ai', 'preeti.saxena@devxlabs.ai', 'sanjana.dutta@devxlabs.ai', 'tanish.malhotra@devxlabs.ai', 'varun.oberoi@devxlabs.ai'],
    },
    {
      name: 'Pod Eta',
      leadEmail: 'rishabh.chandra@devxlabs.ai',
      memberEmails: ['shreya.nambiar@devxlabs.ai', 'mihir.batra@devxlabs.ai', 'sonal.mathur@devxlabs.ai', 'deepika.rao@devxlabs.ai', 'zara.ahmed@devxlabs.ai'],
    },
    {
      name: 'Pod Theta',
      leadEmail: 'akash.gupta@devxlabs.ai', // shared lead (EM oversees multiple pods)
      memberEmails: ['aman.tripathi@devxlabs.ai', 'harish.menon@devxlabs.ai', 'ravi.suresh@devxlabs.ai', 'komal.bansal@devxlabs.ai'],
    },
  ];

  const podIdMap: Record<string, string> = {};

  for (const pod of podDefs) {
    const leadId = empIdMap[pod.leadEmail];
    if (!leadId) { console.warn(`  ⚠ Pod ${pod.name}: lead not found`); continue; }

    // Safe upsert: lead_id is unique+required so we can't null it out.
    // Strategy: if pod exists → keep existing lead (avoid constraint issues on re-runs).
    //           if pod is new → check whether this lead is already used, if so skip.
    let existing = await prisma.pods.findFirst({ where: { name: pod.name } });
    let created;
    if (existing) {
      // Pod already exists — just keep it, grab the id
      created = existing;
    } else {
      // Check no other pod already has this lead
      const leadTaken = await prisma.pods.findFirst({ where: { lead_id: leadId } });
      if (leadTaken) {
        console.warn(`  ⚠ Pod ${pod.name}: lead ${pod.leadEmail} already leads ${leadTaken.name}, skipping`);
        continue;
      }
      created = await prisma.pods.create({ data: { name: pod.name, lead_id: leadId } });
    }
    podIdMap[pod.name] = created.id;

    for (const email of pod.memberEmails) {
      const empId = empIdMap[email];
      if (!empId) continue;
      await prisma.employees.update({
        where: { id: empId },
        data: { pod_id: created.id },
      });
    }
    await prisma.employees.update({
      where: { id: leadId },
      data: { pod_id: created.id },
    });
  }
  console.log(`✓ ${Object.keys(podIdMap).length} pods upserted`);

  // ── 4. Accounts ───────────────────────────────────────────────────────────────

  const accountDefs = [
    { brand: 'Nykaa',              industry: 'Beauty & Cosmetics' },
    { brand: 'Meesho',             industry: 'Social Commerce' },
    { brand: 'Zivame',             industry: 'Fashion & Lingerie' },
    { brand: 'Decathlon',          industry: 'Sporting Goods' },
    { brand: 'Puma India',         industry: 'Sportswear' },
    { brand: 'boAt Lifestyle',     industry: 'Consumer Electronics' },
    { brand: 'Wow Momo',           industry: 'Quick Service Restaurant' },
    { brand: 'Sugar Cosmetics',    industry: 'Beauty & Cosmetics' },
    { brand: 'Lenskart',           industry: 'Eyewear' },
    { brand: 'MamaEarth',          industry: 'D2C Personal Care' },
    { brand: 'Bewakoof',           industry: 'Fashion D2C' },
    { brand: 'Clovia',             industry: 'Innerwear & Lingerie' },
    { brand: 'Myntra',             industry: 'Fashion E-commerce' },
    { brand: 'Fabindia',           industry: 'Ethnic Retail' },
    { brand: 'Boat Storm',         industry: 'Consumer Electronics' },
    { brand: 'Purplle',            industry: 'Beauty & Cosmetics' },
    { brand: 'W for Woman',        industry: 'Women\'s Fashion' },
    { brand: 'Himalaya Wellness',  industry: 'Healthcare & Wellness' },
    { brand: 'Sleepy Owl Coffee',  industry: 'Food & Beverage' },
    { brand: 'The Whole Truth',    industry: 'Health Food D2C' },
    { brand: 'Nua Woman',          industry: 'Women\'s Health D2C' },
    { brand: 'OZiva',              industry: 'Plant-based Nutrition' },
  ];

  const accountIdMap: Record<string, string> = {};
  for (const acc of accountDefs) {
    const created = await prisma.accounts.upsert({
      where: { brand_name: acc.brand },
      update: {},
      create: { brand_name: acc.brand, industry: acc.industry },
    });
    accountIdMap[acc.brand] = created.id;
  }
  console.log(`✓ ${accountDefs.length} accounts upserted`);

  // ── 5. Projects ───────────────────────────────────────────────────────────────

  const kavyaId  = empIdMap['kavya.reddy@devxlabs.ai'];
  const adityaId = empIdMap['aditya.bose@devxlabs.ai'];
  const rituId   = empIdMap['ritu.agarwal@devxlabs.ai'];
  const meghaId  = empIdMap['megha.pillai@devxlabs.ai'];
  const sachinId = empIdMap['sachin.dewan@devxlabs.ai'];

  type ProjectDef = {
    account: string;
    deal: string;
    status: 'UPCOMING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
    pillar: 'CUSTOMER_INTERACTION' | 'MARKETING_AUTOMATION' | 'AI_OPS' | 'ENTERPRISE_ARCHITECTURE';
    billing: 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'RETAINER' | 'MILESTONE_BASED';
    revenue: number;
    pm?: string;
    gc?: string;   // growth consultant
    start: string;
    end?: string;
  };

  const projectDefs: ProjectDef[] = [
    // ── Nykaa ────────────────────────────────────────────────────────────────
    { account: 'Nykaa',              deal: 'Nykaa AI Personalisation Engine',          status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 45000, pm: kavyaId,  start: '2025-01-06' },
    { account: 'Nykaa',              deal: 'Nykaa Shopify Headless Migration',         status: 'COMPLETED', pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'FIXED_PRICE',       revenue: 60000, pm: adityaId, start: '2024-07-01', end: '2024-12-31' },
    { account: 'Nykaa',              deal: 'Nykaa Beauty Loyalty Platform',            status: 'UPCOMING',  pillar: 'CUSTOMER_INTERACTION',      billing: 'RETAINER',          revenue: 38000, pm: meghaId,  start: '2025-10-06' },

    // ── Meesho ───────────────────────────────────────────────────────────────
    { account: 'Meesho',             deal: 'Meesho Supplier Analytics Platform',       status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'TIME_AND_MATERIAL', revenue: 38000, pm: adityaId, start: '2025-02-03' },
    { account: 'Meesho',             deal: 'Meesho Returns Intelligence',              status: 'UPCOMING',  pillar: 'AI_OPS',                    billing: 'MILESTONE_BASED',   revenue: 48000, pm: kavyaId,  start: '2025-10-06' },
    { account: 'Meesho',             deal: 'Meesho Seller Onboarding Automation',      status: 'COMPLETED', pillar: 'MARKETING_AUTOMATION',      billing: 'FIXED_PRICE',       revenue: 28000, pm: rituId,   start: '2024-09-02', end: '2025-02-15' },

    // ── Zivame ───────────────────────────────────────────────────────────────
    { account: 'Zivame',             deal: 'Zivame CX Chatbot & Support AI',          status: 'ACTIVE',    pillar: 'CUSTOMER_INTERACTION',      billing: 'RETAINER',          revenue: 28000, pm: rituId,   start: '2025-01-20' },
    { account: 'Zivame',             deal: 'Zivame Medusa Commerce Build',             status: 'UPCOMING',  pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'FIXED_PRICE',       revenue: 50000, pm: kavyaId,  start: '2025-11-03' },

    // ── Decathlon ─────────────────────────────────────────────────────────────
    { account: 'Decathlon',          deal: 'Decathlon Inventory AI Optimiser',         status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 52000, pm: kavyaId,  start: '2024-11-01' },
    { account: 'Decathlon',          deal: 'Decathlon GCP Data Lake',                  status: 'ON_HOLD',   pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'TIME_AND_MATERIAL', revenue: 35000, pm: adityaId, start: '2025-03-03' },
    { account: 'Decathlon',          deal: 'Decathlon D2C Mobile App',                 status: 'UPCOMING',  pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'MILESTONE_BASED',   revenue: 42000, pm: sachinId, start: '2025-12-01' },

    // ── Puma ─────────────────────────────────────────────────────────────────
    { account: 'Puma India',         deal: 'Puma Marketing Automation Suite',          status: 'ACTIVE',    pillar: 'MARKETING_AUTOMATION',      billing: 'RETAINER',          revenue: 42000, pm: adityaId, start: '2025-01-06' },
    { account: 'Puma India',         deal: 'Puma Enterprise Architecture Revamp',      status: 'ACTIVE',    pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'TIME_AND_MATERIAL', revenue: 38000, pm: adityaId, start: '2025-04-07' },

    // ── boAt ─────────────────────────────────────────────────────────────────
    { account: 'boAt Lifestyle',     deal: 'boAt D2C Growth Sprint',                   status: 'COMPLETED', pillar: 'MARKETING_AUTOMATION',      billing: 'MILESTONE_BASED',   revenue: 30000, pm: rituId,   start: '2024-09-02', end: '2024-12-31' },
    { account: 'boAt Lifestyle',     deal: 'boAt AI Customer Insights',                status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 34000, pm: rituId,   start: '2025-02-17' },

    // ── Sugar Cosmetics ───────────────────────────────────────────────────────
    { account: 'Sugar Cosmetics',    deal: 'Sugar Shopify Plus Optimisation',          status: 'ACTIVE',    pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'TIME_AND_MATERIAL', revenue: 25000, pm: kavyaId,  start: '2025-03-03' },

    // ── Lenskart ─────────────────────────────────────────────────────────────
    { account: 'Lenskart',           deal: 'Lenskart AR Try-On Engine',                status: 'UPCOMING',  pillar: 'AI_OPS',                    billing: 'FIXED_PRICE',       revenue: 70000, pm: adityaId, start: '2025-11-03' },

    // ── MamaEarth ────────────────────────────────────────────────────────────
    { account: 'MamaEarth',          deal: 'MamaEarth CX Automation',                  status: 'ACTIVE',    pillar: 'CUSTOMER_INTERACTION',      billing: 'RETAINER',          revenue: 32000, pm: rituId,   start: '2025-01-06' },

    // ── Bewakoof ─────────────────────────────────────────────────────────────
    { account: 'Bewakoof',           deal: 'Bewakoof Recommendation Engine',           status: 'ON_HOLD',   pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 22000, pm: kavyaId,  start: '2025-04-07' },

    // ── Clovia ───────────────────────────────────────────────────────────────
    { account: 'Clovia',             deal: 'Clovia Fynd Migration',                    status: 'CANCELLED', pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'FIXED_PRICE',       revenue: 18000, pm: adityaId, start: '2025-02-03', end: '2025-04-01' },

    // ── Wow Momo ─────────────────────────────────────────────────────────────
    { account: 'Wow Momo',           deal: 'Wow Momo Loyalty & CRM',                   status: 'ACTIVE',    pillar: 'CUSTOMER_INTERACTION',      billing: 'RETAINER',          revenue: 20000, pm: rituId,   start: '2025-03-03' },

    // ── Myntra ───────────────────────────────────────────────────────────────
    { account: 'Myntra',             deal: 'Myntra AI Stylist Assistant',              status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 58000, pm: meghaId,  start: '2025-02-17' },
    { account: 'Myntra',             deal: 'Myntra Seller Performance Dashboard',      status: 'COMPLETED', pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'FIXED_PRICE',       revenue: 35000, pm: sachinId, start: '2024-10-01', end: '2025-01-31' },

    // ── Purplle ──────────────────────────────────────────────────────────────
    { account: 'Purplle',            deal: 'Purplle Personalisation & Discovery',      status: 'ACTIVE',    pillar: 'AI_OPS',                    billing: 'RETAINER',          revenue: 30000, pm: meghaId,  start: '2025-04-07' },

    // ── Himalaya Wellness ─────────────────────────────────────────────────────
    { account: 'Himalaya Wellness',  deal: 'Himalaya D2C Platform Build',              status: 'ACTIVE',    pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'TIME_AND_MATERIAL', revenue: 44000, pm: sachinId, start: '2025-03-17' },

    // ── Sleepy Owl ────────────────────────────────────────────────────────────
    { account: 'Sleepy Owl Coffee',  deal: 'Sleepy Owl Subscription Commerce',         status: 'UPCOMING',  pillar: 'ENTERPRISE_ARCHITECTURE',   billing: 'MILESTONE_BASED',   revenue: 22000, pm: meghaId,  start: '2025-11-17' },

    // ── The Whole Truth ───────────────────────────────────────────────────────
    { account: 'The Whole Truth',    deal: 'The Whole Truth Marketing AI',             status: 'ACTIVE',    pillar: 'MARKETING_AUTOMATION',      billing: 'RETAINER',          revenue: 18000, pm: rituId,   start: '2025-05-05' },

    // ── OZiva ─────────────────────────────────────────────────────────────────
    { account: 'OZiva',              deal: 'OZiva CX & Retention Suite',               status: 'UPCOMING',  pillar: 'CUSTOMER_INTERACTION',      billing: 'RETAINER',          revenue: 20000, pm: sachinId, start: '2025-12-15' },
  ];

  const projectIdMap: Record<string, string> = {};
  for (const pd of projectDefs) {
    const accountId = accountIdMap[pd.account];
    if (!accountId) { console.warn(`  ⚠ Project "${pd.deal}": account not found`); continue; }

    const existing = await prisma.rms_projects.findFirst({
      where: { deal_name: pd.deal, account_id: accountId, deleted_at: null },
    });

    let project;
    if (existing) {
      project = await prisma.rms_projects.update({
        where: { id: existing.id },
        data: {
          status: pd.status,
          revenue_cents: cents(pd.revenue),
          project_manager_id: pd.pm ?? null,
          growth_consultant_id: pd.gc ?? null,
        },
      });
    } else {
      project = await prisma.rms_projects.create({
        data: {
          account_id: accountId,
          deal_name: pd.deal,
          status: pd.status,
          devx_pillar: pd.pillar,
          billing_model: pd.billing,
          revenue_cents: cents(pd.revenue),
          project_manager_id: pd.pm ?? null,
          growth_consultant_id: pd.gc ?? null,
          start_date: new Date(pd.start),
          end_date: pd.end ? new Date(pd.end) : null,
          expected_compute_cost_cents: cents(Math.round(pd.revenue * 0.05)),
        },
      });
    }
    projectIdMap[pd.deal] = project.id;
  }
  console.log(`✓ ${Object.keys(projectIdMap).length} projects upserted`);

  // ── 6. Allocations ────────────────────────────────────────────────────────────

  const empSprintUsage: Record<string, Record<string, number>> = {};

  function canAllocate(empId: string, sprintId: string, pct: number): boolean {
    const used = empSprintUsage[empId]?.[sprintId] ?? 0;
    return used + pct <= 100;
  }

  function recordAllocation(empId: string, sprintId: string, pct: number) {
    if (!empSprintUsage[empId]) empSprintUsage[empId] = {};
    empSprintUsage[empId][sprintId] = (empSprintUsage[empId][sprintId] ?? 0) + pct;
  }

  // Pre-warm from existing allocations to avoid duplicates
  const existingAllocs = await prisma.rms_allocations.findMany({
    where: { deleted_at: null },
    select: { employee_id: true, sprint_id: true, allocation_percentage: true },
  });
  for (const ea of existingAllocs) {
    recordAllocation(ea.employee_id, ea.sprint_id, ea.allocation_percentage);
  }

  // Helper: sprint lookup by year + sprint_number
  const sprintByYearNum: Record<string, { id: string }> = {};
  for (const s of allActiveSprints) {
    sprintByYearNum[`${s.year}:${s.sprint_number}`] = s;
  }

  type AllocSlot = { empEmail: string; pct: number };
  type AllocPlan = {
    deal: string;
    // Each entry: [year, sprintFrom, sprintTo]
    windows: [number, number, number][];
    slots: AllocSlot[];
  };

  const allocPlans: AllocPlan[] = [
    {
      deal: 'Nykaa AI Personalisation Engine',
      windows: [[2025, 1, 14], [2026, 1, 4]],
      slots: [
        { empEmail: 'priya.sharma@devxlabs.ai',    pct: 100 },
        { empEmail: 'arjun.mehta@devxlabs.ai',     pct: 100 },
        { empEmail: 'kiran.nair@devxlabs.ai',      pct: 50  },
        { empEmail: 'meera.krishnan@devxlabs.ai',  pct: 50  },
        { empEmail: 'aisha.khan@devxlabs.ai',      pct: 50  },
        { empEmail: 'farhan.qureshi@devxlabs.ai',  pct: 50  },
      ],
    },
    {
      deal: 'Meesho Supplier Analytics Platform',
      windows: [[2025, 4, 18]],
      slots: [
        { empEmail: 'namrata.kulkarni@devxlabs.ai', pct: 100 },
        { empEmail: 'omar.sheikh@devxlabs.ai',      pct: 100 },
        { empEmail: 'rohan.kapoor@devxlabs.ai',     pct: 50  },
        { empEmail: 'siddharth.rao@devxlabs.ai',    pct: 50  },
        { empEmail: 'nikhil.tiwari@devxlabs.ai',    pct: 50  },
        { empEmail: 'mihir.batra@devxlabs.ai',      pct: 50  },
      ],
    },
    {
      deal: 'Zivame CX Chatbot & Support AI',
      windows: [[2025, 2, 14]],
      slots: [
        { empEmail: 'ishaan.choudhary@devxlabs.ai', pct: 100 },
        { empEmail: 'pooja.verma@devxlabs.ai',       pct: 50  },
        { empEmail: 'ananya.joshi@devxlabs.ai',      pct: 50  },
        { empEmail: 'swati.desai@devxlabs.ai',       pct: 50  },
      ],
    },
    {
      deal: 'Decathlon Inventory AI Optimiser',
      windows: [[2025, 1, 18], [2026, 1, 6]],
      slots: [
        { empEmail: 'divya.menon@devxlabs.ai',      pct: 50  },
        { empEmail: 'neha.patel@devxlabs.ai',       pct: 100 },
        { empEmail: 'raj.subramaniam@devxlabs.ai',  pct: 50  },
        { empEmail: 'meera.krishnan@devxlabs.ai',   pct: 50  },
        { empEmail: 'vikram.singh@devxlabs.ai',     pct: 50  },
        { empEmail: 'vanya.aggarwal@devxlabs.ai',   pct: 50  },
      ],
    },
    {
      deal: 'Puma Marketing Automation Suite',
      windows: [[2025, 1, 12]],
      slots: [
        { empEmail: 'rahul.mishra@devxlabs.ai',     pct: 100 },
        { empEmail: 'ananya.joshi@devxlabs.ai',     pct: 50  },
        { empEmail: 'aarav.malhotra@devxlabs.ai',   pct: 100 },
        { empEmail: 'zara.ahmed@devxlabs.ai',       pct: 50  },
      ],
    },
    {
      deal: 'boAt AI Customer Insights',
      windows: [[2025, 5, 18], [2026, 1, 3]],
      slots: [
        { empEmail: 'akash.gupta@devxlabs.ai',      pct: 50  },
        { empEmail: 'kiran.nair@devxlabs.ai',       pct: 50  },
        { empEmail: 'pooja.verma@devxlabs.ai',      pct: 50  },
        { empEmail: 'siddharth.rao@devxlabs.ai',    pct: 50  },
      ],
    },
    {
      deal: 'Sugar Shopify Plus Optimisation',
      windows: [[2025, 6, 16]],
      slots: [
        { empEmail: 'rohan.kapoor@devxlabs.ai',     pct: 50  },
        { empEmail: 'nikhil.tiwari@devxlabs.ai',    pct: 50  },
        { empEmail: 'pallavi.gupta@devxlabs.ai',    pct: 50  },
      ],
    },
    {
      deal: 'MamaEarth CX Automation',
      windows: [[2025, 1, 14]],
      slots: [
        { empEmail: 'divya.menon@devxlabs.ai',      pct: 50  },
        { empEmail: 'raj.subramaniam@devxlabs.ai',  pct: 50  },
        { empEmail: 'aisha.khan@devxlabs.ai',       pct: 50  },
        { empEmail: 'shreya.nambiar@devxlabs.ai',   pct: 50  },
      ],
    },
    {
      deal: 'Wow Momo Loyalty & CRM',
      windows: [[2025, 6, 18]],
      slots: [
        { empEmail: 'tanya.bhatt@devxlabs.ai',      pct: 30  },
        { empEmail: 'vikram.singh@devxlabs.ai',     pct: 50  },
        { empEmail: 'kabir.saxena@devxlabs.ai',     pct: 50  },
      ],
    },
    {
      deal: 'Puma Enterprise Architecture Revamp',
      windows: [[2025, 8, 18], [2026, 1, 4]],
      slots: [
        { empEmail: 'akash.gupta@devxlabs.ai',      pct: 50  },
        { empEmail: 'rishabh.chandra@devxlabs.ai',  pct: 100 },
        { empEmail: 'nitin.joshi@devxlabs.ai',      pct: 100 },
        { empEmail: 'sonal.mathur@devxlabs.ai',     pct: 50  },
      ],
    },
    {
      deal: 'Myntra AI Stylist Assistant',
      windows: [[2025, 3, 18], [2026, 1, 6]],
      slots: [
        { empEmail: 'swati.desai@devxlabs.ai',      pct: 100 },
        { empEmail: 'farhan.qureshi@devxlabs.ai',   pct: 50  },
        { empEmail: 'pallavi.gupta@devxlabs.ai',    pct: 50  },
        { empEmail: 'nikhil.tiwari@devxlabs.ai',    pct: 50  },
        { empEmail: 'aisha.khan@devxlabs.ai',       pct: 50  },
      ],
    },
    {
      deal: 'Purplle Personalisation & Discovery',
      windows: [[2025, 7, 18]],
      slots: [
        { empEmail: 'kiran.nair@devxlabs.ai',       pct: 50  },
        { empEmail: 'vanya.aggarwal@devxlabs.ai',   pct: 50  },
        { empEmail: 'mihir.batra@devxlabs.ai',      pct: 50  },
      ],
    },
    {
      deal: 'Himalaya D2C Platform Build',
      windows: [[2025, 5, 18], [2026, 1, 6]],
      slots: [
        { empEmail: 'rishabh.chandra@devxlabs.ai',  pct: 50  },
        { empEmail: 'pallavi.gupta@devxlabs.ai',    pct: 50  },
        { empEmail: 'kabir.saxena@devxlabs.ai',     pct: 50  },
        { empEmail: 'aarav.malhotra@devxlabs.ai',   pct: 50  },
        { empEmail: 'zara.ahmed@devxlabs.ai',       pct: 50  },
      ],
    },
    {
      deal: 'The Whole Truth Marketing AI',
      windows: [[2025, 10, 18]],
      slots: [
        { empEmail: 'farhan.qureshi@devxlabs.ai',   pct: 50  },
        { empEmail: 'shreya.nambiar@devxlabs.ai',   pct: 50  },
      ],
    },
    {
      deal: 'Decathlon GCP Data Lake',
      windows: [[2025, 6, 12]],
      slots: [
        { empEmail: 'tanya.bhatt@devxlabs.ai',      pct: 70  },
        { empEmail: 'vanya.aggarwal@devxlabs.ai',   pct: 50  },
      ],
    },
    {
      deal: 'Meesho Seller Onboarding Automation',
      windows: [[2025, 1, 4]],
      slots: [
        { empEmail: 'rohan.kapoor@devxlabs.ai',     pct: 50  },
        { empEmail: 'ananya.joshi@devxlabs.ai',     pct: 50  },
      ],
    },
  ];

  let allocCount = 0;
  const adminId = empIdMap['admin@devxlabs.ai'] ?? Object.values(empIdMap)[0];

  for (const plan of allocPlans) {
    const projectId = projectIdMap[plan.deal];
    if (!projectId) { console.warn(`  ⚠ No project found for "${plan.deal}"`); continue; }

    for (const [year, fromSprint, toSprint] of plan.windows) {
      const sprintsInRange: { id: string; sprint_number: number; year: number }[] = [];
      for (let sn = fromSprint; sn <= toSprint; sn++) {
        const s = sprintByYearNum[`${year}:${sn}`];
        if (s) sprintsInRange.push({ id: s.id, sprint_number: sn, year });
      }

      for (const slot of plan.slots) {
        if (slot.pct === 0) continue;
        const empId = empIdMap[slot.empEmail];
        if (!empId) continue;

        for (const sprint of sprintsInRange) {
          if (!canAllocate(empId, sprint.id, slot.pct)) continue;

          await prisma.rms_allocations.upsert({
            where: {
              employee_id_project_id_sprint_id: {
                employee_id: empId,
                project_id: projectId,
                sprint_id: sprint.id,
              },
            },
            update: { allocation_percentage: slot.pct },
            create: {
              employee_id: empId,
              project_id: projectId,
              sprint_id: sprint.id,
              allocation_percentage: slot.pct,
              created_by: adminId,
            },
          });
          recordAllocation(empId, sprint.id, slot.pct);
          allocCount++;
        }
      }
    }
  }

  console.log(`✓ ${allocCount} allocations upserted`);

  // ── 7. Summary ────────────────────────────────────────────────────────────────

  console.log('\n✅ Demo seed complete!\n');
  console.log('  Employees : ', Object.keys(empIdMap).length);
  console.log('  Pods      : ', Object.keys(podIdMap).length);
  console.log('  Accounts  : ', accountDefs.length);
  console.log('  Projects  : ', Object.keys(projectIdMap).length);
  console.log('  Allocs    : ', allocCount);
}

main()
  .catch((e) => {
    console.error('Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
