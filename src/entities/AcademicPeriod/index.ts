import type { AcademicPeriod } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import { booleanParam, requiredText } from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** Fecha sin hora (AAAA-MM-DD) del contrato 5.4.6. */
const dateOnly = () =>
  z.iso.date({ error: 'Debe ser una fecha válida en formato AAAA-MM-DD.' });

const code = () => requiredText(20);

// 5.5.9 AcademicPeriodRequest (POST)
export const CreateAcademicPeriodSchema = z
  .object({
    code: code(),
    // Los nombres de periodo y materia no usan la regla de`personName`:
    // el propio contrato muestra "Agosto - Diciembre 2026" (5.2, 5.4.6).
    name: requiredText(100),
    startDate: dateOnly(),
    endDate: dateOnly(),
  })
  .refine((period) => period.endDate > period.startDate, {
    message: 'endDate debe ser posterior a startDate.',
    path: ['endDate'],
  });
export type CreateAcademicPeriodRequest = z.infer<
  typeof CreateAcademicPeriodSchema
>;

// 5.5.9 AcademicPeriodRequest (PATCH - actualización parcial)
export const UpdateAcademicPeriodSchema = z
  .object({
    code: code().optional(),
    name: requiredText(100).optional(),
    startDate: dateOnly().optional(),
    endDate: dateOnly().optional(),
  })
  .refine((period) => Object.keys(period).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateAcademicPeriodRequest = z.infer<
  typeof UpdateAcademicPeriodSchema
>;

// 6.5.1 ListQueryRequest + filtro isCurrent
export const AcademicPeriodListQuerySchema = listQuery({
  sortable: ['code', 'name', 'startDate', 'endDate', 'createdAt'],
  defaultSort: 'startDate:desc',
}).extend({
  isCurrent: booleanParam().optional(),
});
export type AcademicPeriodListQuery = z.infer<
  typeof AcademicPeriodListQuerySchema
>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** AcademicPeriodResource (contrato 5.4.6). */
export interface AcademicPeriodResource {
  id: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
}

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

export function toAcademicPeriodResource(
  period: AcademicPeriod,
): AcademicPeriodResource {
  return {
    id: period.id,
    code: period.code,
    name: period.name,
    startDate: toDateOnly(period.startDate),
    endDate: toDateOnly(period.endDate),
    isCurrent: period.isCurrent,
    createdAt: period.createdAt.toISOString(),
  };
}

/** `AAAA-MM-DD` → `Date` UTC a medianoche, para persistir en `@db.Date`. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
