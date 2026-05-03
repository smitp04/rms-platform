import { prisma } from '@/lib/prisma';

export async function createPod({ name, lead_id }: { name: string; lead_id: string }) {
  if (!name.trim()) throw new Error('Pod name is required');

  const lead = await prisma.employees.findUniqueOrThrow({ where: { id: lead_id } });
  if (lead.status !== 'ACTIVE') throw new Error('Lead must be an ACTIVE employee');

  const existingLead = await prisma.pods.findFirst({
    where: { lead_id, deleted_at: null },
  });
  if (existingLead) throw new Error('This employee is already leading another pod');

  const pod = await prisma.$transaction(async (tx) => {
    const created = await tx.pods.create({
      data: { name: name.trim(), lead_id },
    });

    // Promote lead to POD_LEAD and assign to this pod
    if (lead.system_role !== 'ADMIN') {
      await tx.employees.update({
        where: { id: lead_id },
        data: { system_role: 'POD_LEAD', pod_id: created.id },
      });
    } else {
      await tx.employees.update({
        where: { id: lead_id },
        data: { pod_id: created.id },
      });
    }

    return created;
  });

  return pod;
}

export async function updatePod(
  id: string,
  data: { name?: string; lead_id?: string }
) {
  const before = await prisma.pods.findUniqueOrThrow({ where: { id } });

  if (data.name !== undefined && !data.name.trim()) {
    throw new Error('Pod name is required');
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();

  if (data.lead_id && data.lead_id !== before.lead_id) {
    const newLead = await prisma.employees.findUniqueOrThrow({ where: { id: data.lead_id } });
    if (newLead.status !== 'ACTIVE') throw new Error('New lead must be an ACTIVE employee');

    const existingLead = await prisma.pods.findFirst({
      where: { lead_id: data.lead_id, deleted_at: null, id: { not: id } },
    });
    if (existingLead) throw new Error('This employee is already leading another pod');

    updateData.lead_id = data.lead_id;

    const after = await prisma.$transaction(async (tx) => {
      // Demote old lead (unless ADMIN)
      const oldLead = await tx.employees.findUniqueOrThrow({ where: { id: before.lead_id } });
      if (oldLead.system_role !== 'ADMIN') {
        await tx.employees.update({
          where: { id: before.lead_id },
          data: { system_role: 'EMPLOYEE' },
        });
      }

      // Promote new lead
      if (newLead.system_role !== 'ADMIN') {
        await tx.employees.update({
          where: { id: data.lead_id! },
          data: { system_role: 'POD_LEAD', pod_id: id },
        });
      } else {
        await tx.employees.update({
          where: { id: data.lead_id! },
          data: { pod_id: id },
        });
      }

      return tx.pods.update({ where: { id }, data: updateData as never });
    });

    return { before, after };
  }

  const after = await prisma.pods.update({ where: { id }, data: updateData as never });
  return { before, after };
}

export async function deletePod(id: string) {
  const before = await prisma.pods.findUniqueOrThrow({
    where: { id },
    include: { members: { select: { id: true } } },
  });

  const after = await prisma.$transaction(async (tx) => {
    // Unassign all members
    await tx.employees.updateMany({
      where: { pod_id: id },
      data: { pod_id: null },
    });

    // Demote lead (unless ADMIN)
    const lead = await tx.employees.findUniqueOrThrow({ where: { id: before.lead_id } });
    if (lead.system_role !== 'ADMIN') {
      await tx.employees.update({
        where: { id: before.lead_id },
        data: { system_role: 'EMPLOYEE' },
      });
    }

    // Soft-delete the pod
    return tx.pods.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  });

  return { before, after };
}
