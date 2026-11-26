import type { Prisma, Subject } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type { SubjectListQuery } from '#src/entities/Subject/index.ts';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

async function findMany(
  query: SubjectListQuery,
): Promise<{ items: Subject[]; total: number }> {
  const where: Prisma.SubjectWhereInput = {
    careerId: query.careerId,
    semester: query.semester,
    isActive: query.isActive,
    OR: query.search
      ? [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.subject.findMany({
      where,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.subject.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<Subject | null> {
  return prisma.subject.findUnique({ where: { id } });
}

function careerExists(id: number): Promise<boolean> {
  return prisma.career.count({ where: { id } }).then((count) => count > 0);
}

function create(data: Prisma.SubjectUncheckedCreateInput): Promise<Subject> {
  return prisma.subject.create({ data });
}

function update(
  id: number,
  data: Prisma.SubjectUncheckedUpdateInput,
): Promise<Subject> {
  return prisma.subject.update({ where: { id }, data });
}

/** `code` es único dentro de la carrera (uq_subjects_career_code). */
async function codeTaken(
  careerId: number,
  code: string,
  exceptId?: number,
): Promise<boolean> {
  const found = await prisma.subject.findUnique({
    where: { careerId_code: { careerId, code } },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

async function hasDependencies(id: number): Promise<boolean> {
  const [assignments, materials] = await prisma.$transaction([
    prisma.subjectAssignment.count({ where: { subjectId: id } }),
    prisma.material.count({ where: { subjectId: id } }),
  ]);
  return assignments > 0 || materials > 0;
}

async function remove(id: number): Promise<void> {
  await prisma.subject.delete({ where: { id } });
}

export default {
  findMany,
  findById,
  careerExists,
  create,
  update,
  codeTaken,
  hasDependencies,
  remove,
} as const;
