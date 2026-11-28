import type { MaterialVersion } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import { idParam } from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** Texto libre opcional; el multipart lo envía como cadena, el JSON como null. */
const optionalText = () => z.string().trim().nullable().optional();

// 5.5.14 CreateMaterialVersionRequest (multipart/form-data)
export const CreateMaterialVersionSchema = z.object({
  changelog: optionalText(),
});
export type CreateMaterialVersionRequest = z.infer<
  typeof CreateMaterialVersionSchema
>;

// 6.8.7 ListQueryRequest sin filtros propios; versión más reciente primero.
export const MaterialVersionListQuerySchema = listQuery({
  sortable: ['versionNumber', 'createdAt'],
  defaultSort: 'versionNumber:desc',
});
export type MaterialVersionListQuery = z.infer<
  typeof MaterialVersionListQuerySchema
>;

/** Parámetros de las rutas con versión concreta (6.8.9 y 6.8.10). */
export const VersionParamsSchema = z.object({
  id: idParam(),
  versionNumber: idParam(),
});
export type VersionParams = z.infer<typeof VersionParamsSchema>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** MaterialVersionResource (contrato 5.4.10), sin `storagePath`. */
export interface MaterialVersionResource {
  id: number;
  materialId: number;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  changelog: string | null;
  uploadedBy: number;
  createdAt: string;
}

export function toMaterialVersionResource(
  version: MaterialVersion,
): MaterialVersionResource {
  return {
    id: version.id,
    materialId: version.materialId,
    versionNumber: version.versionNumber,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    // Prisma lo guarda como BigInt; 25 MB caben en el rango seguro de JS.
    fileSizeBytes: Number(version.fileSizeBytes),
    checksumSha256: version.checksumSha256,
    changelog: version.changelog,
    uploadedBy: version.uploadedBy,
    createdAt: version.createdAt.toISOString(),
  };
}
