import type { Institute } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import {
  boolean,
  booleanParam,
  requiredText,
} from '#src/common/validation/rules.ts';

// 5.5.7 InstituteRequest (POST)
export const CreateInstituteSchema = z.object({
  code: requiredText(30),
  name: requiredText(180),
  shortName: requiredText(30),
  city: requiredText(100),
  state: requiredText(100),
  isActive: boolean().optional().default(true),
});
export type CreateInstituteRequest = z.infer<typeof CreateInstituteSchema>;

// 5.5.7 InstituteRequest (PATCH - actualización parcial)
export const UpdateInstituteSchema = z
  .object({
    code: requiredText(30).optional(),
    name: requiredText(180).optional(),
    shortName: requiredText(30).optional(),
    city: requiredText(100).optional(),
    state: requiredText(100).optional(),
    isActive: boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateInstituteRequest = z.infer<typeof UpdateInstituteSchema>;

// 6.3.1 ListQueryRequest + filtro isActive
export const InstituteListQuerySchema = listQuery({
  sortable: ['name', 'code', 'createdAt'],
  defaultSort: 'name:asc',
}).extend({
  isActive: booleanParam().optional(),
});
export type InstituteListQuery = z.infer<typeof InstituteListQuerySchema>;

// 5.4.4 InstituteResource
export interface InstituteResource {
  id: number;
  code: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toInstituteResource(institute: Institute): InstituteResource {
  return {
    id: institute.id,
    code: institute.code,
    name: institute.name,
    shortName: institute.shortName,
    city: institute.city,
    state: institute.state,
    isActive: institute.isActive,
    createdAt: institute.createdAt.toISOString(),
    updatedAt: institute.updatedAt.toISOString(),
  };
}
