import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import { id, idParam, requiredText } from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

// 5.5.11 SubjectAssignmentRequest
export const CreateSubjectAssignmentSchema = z.object({
  subjectId: id(),
  teacherId: id(),
  academicPeriodId: id(),
  groupCode: requiredText(20),
});
export type CreateSubjectAssignmentRequest = z.infer<
  typeof CreateSubjectAssignmentSchema
>;

// 6.7.1 ListQueryRequest + filtros teacherId, subjectId,
// academicPeriodId y groupCode
export const SubjectAssignmentListQuerySchema = listQuery({
  sortable: ['createdAt', 'groupCode', 'id'],
  defaultSort: 'createdAt:desc',
}).extend({
  teacherId: idParam().optional(),
  subjectId: idParam().optional(),
  academicPeriodId: idParam().optional(),
  groupCode: z.string().trim().max(20).optional(),
});
export type SubjectAssignmentListQuery = z.infer<
  typeof SubjectAssignmentListQuerySchema
>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** Proyecciones mínimas incluidas en SubjectAssignmentResource (5.4.8). */
export const assignmentRelations = {
  subject: true,
  teacher: true,
  academicPeriod: true,
} as const;

export type SubjectAssignmentWithRelations =
  Prisma.SubjectAssignmentGetPayload<{
    include: typeof assignmentRelations;
  }>;

/** SubjectAssignmentResource (contrato 5.4.8). */
export interface SubjectAssignmentResource {
  id: number;
  subjectId: number;
  teacherId: number;
  academicPeriodId: number;
  groupCode: string;
  assignedBy: number | null;
  createdAt: string;
  subject: { id: number; code: string; name: string };
  teacher: { id: number; firstName: string; lastName: string };
  academicPeriod: { id: number; code: string; name: string };
}

export function toSubjectAssignmentResource(
  assignment: SubjectAssignmentWithRelations,
): SubjectAssignmentResource {
  return {
    id: assignment.id,
    subjectId: assignment.subjectId,
    teacherId: assignment.teacherId,
    academicPeriodId: assignment.academicPeriodId,
    groupCode: assignment.groupCode,
    assignedBy: assignment.assignedBy,
    createdAt: assignment.createdAt.toISOString(),
    subject: {
      id: assignment.subject.id,
      code: assignment.subject.code,
      name: assignment.subject.name,
    },
    teacher: {
      id: assignment.teacher.id,
      firstName: assignment.teacher.firstName,
      lastName: assignment.teacher.lastName,
    },
    academicPeriod: {
      id: assignment.academicPeriod.id,
      code: assignment.academicPeriod.code,
      name: assignment.academicPeriod.name,
    },
  };
}
