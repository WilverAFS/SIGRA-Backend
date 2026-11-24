import type { Prisma } from '@prisma/client';

import type { RoleName } from '#src/entities/User/index.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const RECENT_MATERIALS_LIMIT = 5;

/** Valores de MaterialVisibility (contrato 5.3). */
export const MaterialVisibility = {
  ESTUDIANTES_Y_DOCENTES: 'ESTUDIANTES_Y_DOCENTES',
  SOLO_DOCENTES: 'SOLO_DOCENTES',
} as const;

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/** Proyección resumida de un periodo. */
export interface PeriodSummary {
  id: number;
  code: string;
  name: string;
}

/**
 * MaterialResource (contrato 5.4.9) en su forma de listado, sin
 * currentVersionDetail.
 */
export interface MaterialListItem {
  id: number;
  subjectId: number;
  authorId: number;
  academicPeriodId: number;
  title: string;
  description: string | null;
  materialType: string;
  visibility: string;
  currentVersion: number;
  syllabusChangesNote: string | null;
  downloadCount: number;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: number; firstName: string; lastName: string };
  subject: { id: number; code: string; name: string };
  academicPeriod: PeriodSummary;
}

/** DashboardSummaryResource (contrato 5.4.13). */
export interface DashboardSummaryResource {
  currentPeriod: PeriodSummary | null;
  counts: {
    activeCareers: number;
    activeSubjects: number;
    visibleMaterials: number;
    /** DOCENTE: las suyas; ADMIN: total global; ESTUDIANTE: null. */
    myAssignments: number | null;
    /** DOCENTE: los suyos; ADMIN: total global; ESTUDIANTE: null. */
    myMaterials: number | null;
  };
  recentMaterials: MaterialListItem[];
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Materiales visibles para un rol (contrato cap. 2.3 y 5.4.9): sin bajas
 * lógicas y, para ESTUDIANTE, solo aprobados y visibles para estudiantes.
 *
 * Cuando exista el módulo de materiales (BE #4) puede reutilizar este filtro.
 */
export function visibleMaterialsWhere(
  role: RoleName,
): Prisma.MaterialWhereInput {
  if (role === 'ESTUDIANTE') {
    return {
      deletedAt: null,
      isApproved: true,
      visibility: MaterialVisibility.ESTUDIANTES_Y_DOCENTES,
    };
  }
  return { deletedAt: null };
}

/** Relaciones necesarias para la proyección del listado. */
export const materialListInclude = {
  author: { select: { id: true, firstName: true, lastName: true } },
  subject: { select: { id: true, code: true, name: true } },
  academicPeriod: { select: { id: true, code: true, name: true } },
} as const satisfies Prisma.MaterialInclude;

type MaterialWithRelations = Prisma.MaterialGetPayload<{
  include: typeof materialListInclude;
}>;

/** Lista blanca de campos: nunca expone correo, matrícula ni rutas. */
export function toMaterialListItem(
  material: MaterialWithRelations,
): MaterialListItem {
  return {
    id: material.id,
    subjectId: material.subjectId,
    authorId: material.authorId,
    academicPeriodId: material.academicPeriodId,
    title: material.title,
    description: material.description,
    materialType: material.materialType,
    visibility: material.visibility,
    currentVersion: material.currentVersion,
    syllabusChangesNote: material.syllabusChangesNote,
    downloadCount: material.downloadCount,
    isApproved: material.isApproved,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
    author: material.author,
    subject: material.subject,
    academicPeriod: material.academicPeriod,
  };
}
