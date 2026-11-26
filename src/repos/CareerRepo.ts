import type { Career, Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type { CareerListQuery } from '#src/entities/Career/index.ts';

async function findMany(
  query: CareerListQuery,
): Promise<{ items: Career[]; total: number }> {
  const where: Prisma.CareerWhereInput = {
    instituteId: query.instituteId,
    isActive: query.isActive,
    OR: query.search
      ? [
          { name: { contains: query.search, mode: 'insensitive' } },
          { shortName: { contains: query.search, mode: 'insensitive' } },
          { curriculumCode: { contains: query.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.career.findMany({
      where,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.career.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<Career | null> {
  return prisma.career.findUnique({ where: { id } });
}

function create(data: Prisma.CareerUncheckedCreateInput): Promise<Career> {
  return prisma.career.create({ data });
}

function update(
  id: number,
  data: Prisma.CareerUncheckedUpdateInput,
): Promise<Career> {
  return prisma.career.update({ where: { id }, data });
}

async function remove(id: number): Promise<void> {
  await prisma.career.delete({ where: { id } });
}

async function curriculumCodeTaken(
  instituteId: number,
  curriculumCode: string,
  exceptId?: number,
): Promise<boolean> {
  const found = await prisma.career.findUnique({
    where: {
      instituteId_curriculumCode: { instituteId, curriculumCode },
    },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

async function hasDependencies(id: number): Promise<boolean> {
  const [subjects, users] = await prisma.$transaction([
    prisma.subject.count({ where: { careerId: id } }),
    prisma.user.count({ where: { careerId: id, deletedAt: null } }),
  ]);
  return subjects > 0 || users > 0;
}

export default {
  findMany,
  findById,
  create,
  update,
  remove,
  curriculumCodeTaken,
  hasDependencies,
} as const;
