import type { Career } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import {
  boolean,
  booleanParam,
  id,
  idParam,
  Messages,
  requiredText,
} from '#src/common/validation/rules.ts';

const semestersSchema = z
  .number({
    error: (issue) =>
      issue.input === undefined ? Messages.REQUIRED : Messages.INTEGER,
  })
  .int(Messages.INTEGER)
  .min(1, 'El total de semestres debe ser al menos 1.')
  .max(14, 'El total de semestres no puede exceder 14.');

// 5.5.8 CareerRequest (POST)
export const CreateCareerSchema = z.object({
  curriculumCode: requiredText(40),
  name: requiredText(180),
  shortName: requiredText(20),
  totalSemesters: semestersSchema.optional().default(9),
  instituteId: id(),
  isActive: boolean().optional().default(true),
});
export type CreateCareerRequest = z.infer<typeof CreateCareerSchema>;

// 5.5.8 CareerRequest (PATCH - actualización parcial)
export const UpdateCareerSchema = z
  .object({
    curriculumCode: requiredText(40).optional(),
    name: requiredText(180).optional(),
    shortName: requiredText(20).optional(),
    totalSemesters: semestersSchema.optional(),
    instituteId: id().optional(),
    isActive: boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateCareerRequest = z.infer<typeof UpdateCareerSchema>;

// 6.4.1 ListQueryRequest + filtros instituteId, isActive y search
export const CareerListQuerySchema = listQuery({
  sortable: ['name', 'curriculumCode', 'createdAt'],
  defaultSort: 'name:asc',
}).extend({
  instituteId: idParam().optional(),
  isActive: booleanParam().optional(),
});
export type CareerListQuery = z.infer<typeof CareerListQuerySchema>;

// 5.4.5 CareerResource (sin anidar instituto, solo instituteId)
export interface CareerResource {
  id: number;
  instituteId: number;
  curriculumCode: string;
  name: string;
  shortName: string;
  totalSemesters: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toCareerResource(career: Career): CareerResource {
  return {
    id: career.id,
    instituteId: career.instituteId,
    curriculumCode: career.curriculumCode,
    name: career.name,
    shortName: career.shortName,
    totalSemesters: career.totalSemesters,
    isActive: career.isActive,
    createdAt: career.createdAt.toISOString(),
    updatedAt: career.updatedAt.toISOString(),
  };
}
