import type { AcademicPeriod, Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type {
  AcademicPeriodListQuery,
  CreateAcademicPeriodRequest,
  UpdateAcademicPeriodRequest,
} from '#src/entities/AcademicPeriod/index.ts';
import { parseDateOnly } from '#src/entities/AcademicPeriod/index.ts';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

async function findMany(
  query: AcademicPeriodListQuery,
): Promise<{ items: AcademicPeriod[]; total: number }> {
  const where: Prisma.AcademicPeriodWhereInput = {
    isCurrent: query.isCurrent,
    OR: query.search
      ? [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.academicPeriod.findMany({
      where,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.academicPeriod.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<AcademicPeriod | null> {
  return prisma.academicPeriod.findUnique({ where: { id } });
}

function findCurrent(): Promise<AcademicPeriod | null> {
  return prisma.academicPeriod.findFirst({ where: { isCurrent: true } });
}

function create(data: CreateAcademicPeriodRequest): Promise<AcademicPeriod> {
  return prisma.academicPeriod.create({
    data: {
      code: data.code,
      name: data.name,
      startDate: parseDateOnly(data.startDate),
      endDate: parseDateOnly(data.endDate),
    },
  });
}

function update(
  id: number,
  data: UpdateAcademicPeriodRequest,
): Promise<AcademicPeriod> {
  const { startDate, endDate, ...rest } = data;
  return prisma.academicPeriod.update({
    where: { id },
    data: {
      ...rest,
      ...(startDate ? { startDate: parseDateOnly(startDate) } : {}),
      ...(endDate ? { endDate: parseDateOnly(endDate) } : {}),
    },
  });
}

/**
 * Fijar el periodo vigente: desmarca el anterior y marca el nuevo en una
 * sola transacción, para que nunca existan dos (ni ninguno) a la vez.
 */
function setCurrent(id: number): Promise<AcademicPeriod | null> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.academicPeriod.findUnique({ where: { id } });
    if (!target) return null;
    await tx.academicPeriod.updateMany({
      where: { isCurrent: true, id: { not: id } },
      data: { isCurrent: false },
    });
    return tx.academicPeriod.update({
      where: { id },
      data: { isCurrent: true },
    });
  });
}

async function codeTaken(code: string, exceptId?: number): Promise<boolean> {
  const found = await prisma.academicPeriod.findUnique({
    where: { code },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

/** Asignaciones y materiales (incluso los borrados lógicamente) dependen del periodo. */
async function hasDependencies(id: number): Promise<boolean> {
  const [assignments, materials] = await prisma.$transaction([
    prisma.subjectAssignment.count({ where: { academicPeriodId: id } }),
    prisma.material.count({ where: { academicPeriodId: id } }),
  ]);
  return assignments > 0 || materials > 0;
}

async function remove(id: number): Promise<void> {
  await prisma.academicPeriod.delete({ where: { id } });
}

export default {
  findMany,
  findById,
  findCurrent,
  create,
  update,
  setCurrent,
  codeTaken,
  hasDependencies,
  remove,
} as const;
