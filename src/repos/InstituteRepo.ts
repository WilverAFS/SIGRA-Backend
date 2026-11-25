import type { Institute, Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type { InstituteListQuery } from '#src/entities/Institute/index.ts';

async function findMany(
  query: InstituteListQuery,
): Promise<{ items: Institute[]; total: number }> {
  const where: Prisma.InstituteWhereInput = {
    isActive: query.isActive,
    OR: query.search
      ? [
          { name: { contains: query.search, mode: 'insensitive' } },
          { shortName: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.institute.findMany({
      where,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.institute.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<Institute | null> {
  return prisma.institute.findUnique({ where: { id } });
}

function create(data: Prisma.InstituteCreateInput): Promise<Institute> {
  return prisma.institute.create({ data });
}

function update(
  id: number,
  data: Prisma.InstituteUpdateInput,
): Promise<Institute> {
  return prisma.institute.update({ where: { id }, data });
}

async function remove(id: number): Promise<void> {
  await prisma.institute.delete({ where: { id } });
}

async function codeTaken(code: string, exceptId?: number): Promise<boolean> {
  const found = await prisma.institute.findUnique({
    where: { code },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

async function hasDependencies(id: number): Promise<boolean> {
  const [careers, users] = await prisma.$transaction([
    prisma.career.count({ where: { instituteId: id } }),
    prisma.user.count({ where: { instituteId: id, deletedAt: null } }),
  ]);
  return careers > 0 || users > 0;
}

export default {
  findMany,
  findById,
  create,
  update,
  remove,
  codeTaken,
  hasDependencies,
} as const;
