import type { Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import {
  assignmentRelations,
  type SubjectAssignmentListQuery,
  type SubjectAssignmentWithRelations,
} from '#src/entities/SubjectAssignment/index.ts';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Lista paginada. Si `forcedTeacherId` viene del token de un DOCENTE, sustituye
 * siempre al filtro `teacherId` de la query: el docente nunca ve asignaciones
 * ajenas.
 */
async function findMany(
  query: SubjectAssignmentListQuery,
  forcedTeacherId?: number,
): Promise<{ items: SubjectAssignmentWithRelations[]; total: number }> {
  const where: Prisma.SubjectAssignmentWhereInput = {
    teacherId: forcedTeacherId ?? query.teacherId,
    subjectId: query.subjectId,
    academicPeriodId: query.academicPeriodId,
    groupCode: query.groupCode,
    OR: query.search
      ? [
          { groupCode: { contains: query.search, mode: 'insensitive' } },
          {
            subject: {
              code: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            subject: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.subjectAssignment.findMany({
      where,
      include: assignmentRelations,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.subjectAssignment.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<SubjectAssignmentWithRelations | null> {
  return prisma.subjectAssignment.findUnique({
    where: { id },
    include: assignmentRelations,
  });
}

function create(
  data: Prisma.SubjectAssignmentUncheckedCreateInput,
): Promise<SubjectAssignmentWithRelations> {
  return prisma.subjectAssignment.create({
    data,
    include: assignmentRelations,
  });
}

/** Combinación única materia + docente + periodo + grupo (5.5.11). */
async function duplicated(
  subjectId: number,
  teacherId: number,
  academicPeriodId: number,
  groupCode: string,
): Promise<boolean> {
  const found = await prisma.subjectAssignment.findUnique({
    where: {
      subjectId_teacherId_academicPeriodId_groupCode: {
        subjectId,
        teacherId,
        academicPeriodId,
        groupCode,
      },
    },
    select: { id: true },
  });
  return !!found;
}

async function teacherIsActiveDocente(id: number): Promise<boolean> {
  const count = await prisma.user.count({
    where: {
      id,
      isActive: true,
      deletedAt: null,
      role: { name: 'DOCENTE' },
    },
  });
  return count > 0;
}

async function academicPeriodExists(id: number): Promise<boolean> {
  return (await prisma.academicPeriod.count({ where: { id } })) > 0;
}

async function remove(id: number): Promise<void> {
  await prisma.subjectAssignment.delete({ where: { id } });
}

export default {
  findMany,
  findById,
  create,
  duplicated,
  teacherIsActiveDocente,
  academicPeriodExists,
  remove,
} as const;
