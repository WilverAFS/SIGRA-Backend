import type { Role } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';

function findAll(): Promise<Role[]> {
  return prisma.role.findMany({
    orderBy: { id: 'asc' },
  });
}

function findById(id: number): Promise<Role | null> {
  return prisma.role.findUnique({
    where: { id },
  });
}

export default {
  findAll,
  findById,
} as const;
