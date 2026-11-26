import type { Subject } from '@prisma/client';
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

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

const semester = () =>
  z
    .number({
      error: (issue) =>
        issue.input === undefined ? Messages.REQUIRED : Messages.INTEGER,
    })
    .int(Messages.INTEGER)
    .min(1, 'semester debe estar entre 1 y 12.')
    .max(12, 'semester debe estar entre 1 y 12.');

const credits = () =>
  z
    .number({
      error: (issue) =>
        issue.input === undefined ? Messages.REQUIRED : Messages.INTEGER,
    })
    .int(Messages.INTEGER)
    .min(0, 'Los créditos deben ser enteros mayores o iguales a 0.');

/** syllabusSummary es texto libre y puede ser null (5.4.7). */
const syllabusSummary = () => z.string().trim().nullable().optional();

// 5.5.10 SubjectRequest (POST)
export const CreateSubjectSchema = z.object({
  careerId: id(),
  code: requiredText(30),
  // La regla de "solo letras" de 5.2 aplica a User.firstName/lastName: los
  // ejemplos del contrato incluyen "Taller de Bases de Datos" y "AED-1286".
  name: requiredText(180),
  semester: semester(),
  creditsTheory: credits(),
  creditsPractice: credits(),
  syllabusSummary: syllabusSummary(),
  isActive: boolean().optional().default(true),
});
export type CreateSubjectRequest = z.infer<typeof CreateSubjectSchema>;

// 5.5.10 SubjectRequest (PATCH - actualización parcial)
export const UpdateSubjectSchema = z
  .object({
    careerId: id().optional(),
    code: requiredText(30).optional(),
    name: requiredText(180).optional(),
    semester: semester().optional(),
    creditsTheory: credits().optional(),
    creditsPractice: credits().optional(),
    syllabusSummary: syllabusSummary(),
    isActive: boolean().optional(),
  })
  .refine((subject) => Object.keys(subject).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateSubjectRequest = z.infer<typeof UpdateSubjectSchema>;

/** `totalCredits` es de solo lectura: se calcula en el backend. */
export function totalCreditsOf(
  subject: Pick<Subject, 'creditsTheory' | 'creditsPractice'>,
): number {
  return subject.creditsTheory + subject.creditsPractice;
}

// 6.6.1 ListQueryRequest + filtros careerId, semester, isActive y search
export const SubjectListQuerySchema = listQuery({
  sortable: ['semester', 'code', 'name'],
  defaultSort: 'semester:asc',
}).extend({
  careerId: idParam().optional(),
  semester: z
    .string()
    .regex(/^(1[0-2]|[1-9])$/, 'semester debe estar entre 1 y 12.')
    .transform(Number)
    .optional(),
  isActive: booleanParam().optional(),
});
export type SubjectListQuery = z.infer<typeof SubjectListQuerySchema>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** SubjectResource (contrato 5.4.7). */
export interface SubjectResource {
  id: number;
  careerId: number;
  code: string;
  name: string;
  semester: number;
  creditsTheory: number;
  creditsPractice: number;
  totalCredits: number;
  syllabusSummary: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toSubjectResource(subject: Subject): SubjectResource {
  return {
    id: subject.id,
    careerId: subject.careerId,
    code: subject.code,
    name: subject.name,
    semester: subject.semester,
    creditsTheory: subject.creditsTheory,
    creditsPractice: subject.creditsPractice,
    totalCredits: totalCreditsOf(subject),
    syllabusSummary: subject.syllabusSummary,
    isActive: subject.isActive,
    createdAt: subject.createdAt.toISOString(),
    updatedAt: subject.updatedAt.toISOString(),
  };
}
