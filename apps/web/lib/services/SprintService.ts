import { SPRINT_DURATION_DAYS } from '@devx/config';
import { prisma } from '@/lib/prisma';

export async function getCurrentSprint() {
  const now = new Date();
  // Sprint end_date is stored as midnight UTC. The sprint should be active for the
  // entire last day, so compare end_date against start-of-today UTC, not the exact time.
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.rms_sprints.findFirst({
    where: {
      start_date: { lte: now },
      end_date: { gte: todayStart },
    },
  });
}

export async function getSprintById(id: string) {
  return prisma.rms_sprints.findUnique({ where: { id } });
}

export async function getSprintsByYear(year: number) {
  return prisma.rms_sprints.findMany({
    where: { year },
    orderBy: { sprint_number: 'asc' },
  });
}

export async function getAllSprints() {
  return prisma.rms_sprints.findMany({
    orderBy: [{ year: 'asc' }, { sprint_number: 'asc' }],
  });
}

/**
 * Idempotent — generates sprints for the given year only if none exist.
 * Safe to call on every request.
 */
export async function ensureSprintsForYear(year: number) {
  const count = await prisma.rms_sprints.count({ where: { year } });
  if (count > 0) return;
  await generateSprintsForYear(year);
}

export async function generateSprintsForYear(year: number) {
  // Check if already generated
  const existing = await prisma.rms_sprints.count({ where: { year } });
  if (existing > 0) {
    throw new Error(`Sprints for ${year} already exist`);
  }

  const sprints = [];
  let start = new Date(`${year}-01-01`);

  // Align to Monday
  const day = start.getDay();
  if (day !== 1) {
    const offset = day === 0 ? 1 : 8 - day;
    start = new Date(start.getTime() + offset * 86400000);
  }

  for (let i = 1; i <= 26; i++) {
    const end = new Date(start.getTime() + (SPRINT_DURATION_DAYS - 1) * 86400000);
    sprints.push({
      sprint_number: i,
      year,
      start_date: new Date(start),
      end_date: end,
      label: `S${i}-${year}`,
    });
    start = new Date(end.getTime() + 86400000);
  }

  await prisma.rms_sprints.createMany({ data: sprints });
  return sprints;
}

export function getQuarterOfDate(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}

export function isLastMonthOfQuarter(d: Date): boolean {
  return d.getUTCMonth() % 3 === 2;
}

export async function getSprintsForQuarter(year: number, quarter: number, includeNext: boolean) {
  const months = [(quarter - 1) * 3, (quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2];
  const ranges: { year: number; months: number[] }[] = [{ year, months }];
  if (includeNext) {
    if (quarter === 4) ranges.push({ year: year + 1, months: [0, 1, 2] });
    else ranges.push({ year, months: [quarter * 3, quarter * 3 + 1, quarter * 3 + 2] });
  }
  // Always include previous calendar month relative to today
  const today = new Date();
  const prevMonth = today.getUTCMonth() === 0 ? 11 : today.getUTCMonth() - 1;
  const prevYear = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
  ranges.push({ year: prevYear, months: [prevMonth] });

  const involvedYears = [...new Set(ranges.map((r) => r.year))];
  const all = await prisma.rms_sprints.findMany({
    where: { year: { in: involvedYears } },
    orderBy: [{ year: 'asc' }, { sprint_number: 'asc' }],
  });
  const allowed = new Set(ranges.flatMap((r) => r.months.map((m) => `${r.year}-${m}`)));
  return all.filter((s) => allowed.has(`${s.year}-${new Date(s.start_date).getUTCMonth()}`));
}

export function classifySprint(sprint: { start_date: Date; end_date: Date }) {
  const now = new Date();
  // end_date is stored as midnight UTC — treat the entire last day as part of the sprint
  const endInclusive = new Date(sprint.end_date);
  endInclusive.setUTCHours(23, 59, 59, 999);
  if (endInclusive < now) return 'past';
  if (sprint.start_date > now) return 'future';
  return 'current';
}
