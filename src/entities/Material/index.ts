import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import {
  boolean,
  idParam,
  requiredText,
} from '#src/common/validation/rules.ts';
import type { MaterialVersionResource } from '#src/entities/MaterialVersion/index.ts';

// ========================================================================= //
//                                 CATÁLOGOS                                  //
// ========================================================================= //

// 5.3 MaterialType
export const MATERIAL_TYPES = [
  'PLANEACION',
  'TEMARIO',
  'APUNTE',
  'DIAPOSITIVA',
  'PRACTICA',
  'EVALUACION',
  'OTRO',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

// 5.3 MaterialVisibility
export const MATERIAL_VISIBILITIES = [
  'ESTUDIANTES_Y_DOCENTES',
  'SOLO_DOCENTES',
] as const;
export type MaterialVisibility = (typeof MATERIAL_VISIBILITIES)[number];

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** Texto libre opcional: en multipart llega como cadena y en JSON puede ser null. */
const optionalText = () => z.string().trim().nullable().optional();

// 5.5.12 CreateMaterialRequest (multipart/form-data)
export const CreateMaterialSchema = z.object({
  subjectId: idParam(),
  academicPeriodId: idParam(),
  // 5.2 limita "solo letras" a User.firstName/lastName; el propio ejemplo del
  // contrato para title incluye dígitos y guion ("Planeación didáctica 2026-2").
  title: requiredText(220),
  description: optionalText(),
  materialType: z.enum(MATERIAL_TYPES),
  visibility: z.enum(MATERIAL_VISIBILITIES).default('ESTUDIANTES_Y_DOCENTES'),
  syllabusChangesNote: optionalText(),
  changelog: optionalText(),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialSchema>;

// 5.5.13 UpdateMaterialRequest (JSON, PATCH parcial)
export const UpdateMaterialSchema = z
  .object({
    title: requiredText(220).optional(),
    description: optionalText(),
    materialType: z.enum(MATERIAL_TYPES).optional(),
    visibility: z.enum(MATERIAL_VISIBILITIES).optional(),
    syllabusChangesNote: optionalText(),
    isApproved: boolean().optional(),
  })
  .refine((material) => Object.keys(material).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateMaterialRequest = z.infer<typeof UpdateMaterialSchema>;

// 6.8.1 ListQueryRequest + filtros propios
export const MaterialListQuerySchema = listQuery({
  sortable: ['createdAt', 'title', 'downloadCount'],
  defaultSort: 'createdAt:desc',
}).extend({
  instituteId: idParam().optional(),
  subjectId: idParam().optional(),
  academicPeriodId: idParam().optional(),
  authorId: idParam().optional(),
  materialType: z.enum(MATERIAL_TYPES).optional(),
  visibility: z.enum(MATERIAL_VISIBILITIES).optional(),
});
export type MaterialListQuery = z.infer<typeof MaterialListQuerySchema>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** Proyección mínima del autor; nunca correo, matrícula ni rol (5.4.9). */
export const materialRelations = {
  author: { select: { id: true, firstName: true, lastName: true } },
  subject: true,
  academicPeriod: true,
} as const;

export type MaterialWithRelations = Prisma.MaterialGetPayload<{
  include: typeof materialRelations;
}>;

/** MaterialResource (contrato 5.4.9). */
export interface MaterialResource {
  id: number;
  subjectId: number;
  authorId: number;
  academicPeriodId: number;
  title: string;
  description: string | null;
  materialType: MaterialType;
  visibility: MaterialVisibility;
  currentVersion: number;
  syllabusChangesNote: string | null;
  downloadCount: number;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: number; firstName: string; lastName: string };
  subject: { id: number; code: string; name: string };
  academicPeriod: { id: number; code: string; name: string };
}

/** Solo en creación (6.8.2) y detalle (6.8.3), nunca en listados. */
export interface MaterialDetailResource extends MaterialResource {
  currentVersionDetail: MaterialVersionResource;
}

export function toMaterialResource(
  material: MaterialWithRelations,
): MaterialResource {
  return {
    id: material.id,
    subjectId: material.subjectId,
    authorId: material.authorId,
    academicPeriodId: material.academicPeriodId,
    title: material.title,
    description: material.description,
    materialType: material.materialType as MaterialType,
    visibility: material.visibility as MaterialVisibility,
    currentVersion: material.currentVersion,
    syllabusChangesNote: material.syllabusChangesNote,
    downloadCount: material.downloadCount,
    isApproved: material.isApproved,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
    author: {
      id: material.author.id,
      firstName: material.author.firstName,
      lastName: material.author.lastName,
    },
    subject: {
      id: material.subject.id,
      code: material.subject.code,
      name: material.subject.name,
    },
    academicPeriod: {
      id: material.academicPeriod.id,
      code: material.academicPeriod.code,
      name: material.academicPeriod.name,
    },
  };
}
