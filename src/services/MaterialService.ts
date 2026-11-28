import type { Prisma } from '@prisma/client';

import {
  NotFoundError,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import {
  assertUploadAvailable,
  removeUpload,
  saveUpload,
} from '#src/common/infra/upload.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import type {
  CreateMaterialRequest,
  MaterialDetailResource,
  MaterialListQuery,
  MaterialResource,
  MaterialType,
  MaterialVisibility,
  MaterialWithRelations,
  UpdateMaterialRequest,
} from '#src/entities/Material/index.ts';
import { toMaterialResource } from '#src/entities/Material/index.ts';
import type {
  CreateMaterialVersionRequest,
  MaterialVersionListQuery,
  MaterialVersionResource,
} from '#src/entities/MaterialVersion/index.ts';
import { toMaterialVersionResource } from '#src/entities/MaterialVersion/index.ts';
import type { RoleName } from '#src/entities/User/index.ts';
import MaterialRepo, {
  type MaterialReadScope,
} from '#src/repos/MaterialRepo.ts';

export const MaterialMessages = {
  LISTED: 'Materiales obtenidos correctamente.',
  CREATED: 'Material creado correctamente.',
  FOUND: 'Material obtenido correctamente.',
  UPDATED: 'Material actualizado correctamente.',
  DELETED: 'Material eliminado correctamente.',
  VERSIONS_LISTED: 'Versiones obtenidas correctamente.',
  VERSION_CREATED: 'Versión creada correctamente.',
  VERSION_FOUND: 'Versión obtenida correctamente.',
  NOT_FOUND: 'El material no existe o no está disponible para tu rol.',
  VERSION_NOT_FOUND: 'Esa versión no existe en este material.',
  SUBJECT_NOT_FOUND: 'La materia especificada no existe.',
  PERIOD_NOT_FOUND: 'El periodo académico especificado no existe.',
  FORBIDDEN_ROLE: 'No tienes permisos para esta operación sobre materiales.',
  FORBIDDEN_OWNERSHIP: 'No tienes permisos para modificar un material ajeno.',
  FORBIDDEN_SUBJECT_ASSIGNMENT:
    'No tienes una asignación vigente para la materia de este material.',
  FILE_REQUIRED: 'El campo de archivo `file` es obligatorio.',
} as const;

/** Datos del usuario del token que determinan visibilidad y propiedad. */
export interface MaterialViewer {
  id: number;
  role: RoleName;
}

export interface VersionUploadResult {
  version: MaterialVersionResource;
  materialType: MaterialType;
}

function forbidden(
  code:
    | typeof ErrorCodes.FORBIDDEN_ROLE
    | typeof ErrorCodes.FORBIDDEN_OWNERSHIP
    | typeof ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT,
): RouteError {
  return new RouteError(
    code,
    {
      [ErrorCodes.FORBIDDEN_ROLE]: MaterialMessages.FORBIDDEN_ROLE,
      [ErrorCodes.FORBIDDEN_OWNERSHIP]: MaterialMessages.FORBIDDEN_OWNERSHIP,
      [ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT]:
        MaterialMessages.FORBIDDEN_SUBJECT_ASSIGNMENT,
    }[code],
  );
}

/** Un estudiante nunca ve materiales SOLO_DOCENTES ni sin aprobar. */
function isVisible(material: MaterialWithRelations, viewer: MaterialViewer) {
  if (viewer.role !== 'ESTUDIANTE') return true;
  return (
    material.visibility === 'ESTUDIANTES_Y_DOCENTES' && material.isApproved
  );
}

function requireVisible(
  material: MaterialWithRelations | null,
  viewer: MaterialViewer,
): MaterialWithRelations {
  if (!material || !isVisible(material, viewer)) {
    throw new NotFoundError(MaterialMessages.NOT_FOUND);
  }
  return material;
}

/** ADMIN puede todo; DOCENTE solo sobre sus propios materiales. */
function requireOwner(
  material: MaterialWithRelations,
  viewer: MaterialViewer,
): void {
  if (viewer.role === 'ESTUDIANTE') {
    throw forbidden(ErrorCodes.FORBIDDEN_ROLE);
  }
  if (viewer.role === 'DOCENTE' && material.authorId !== viewer.id) {
    throw forbidden(ErrorCodes.FORBIDDEN_OWNERSHIP);
  }
}

function scopeFor(
  viewer: MaterialViewer,
  queryVisibility?: MaterialVisibility,
): MaterialReadScope {
  if (viewer.role === 'ESTUDIANTE') {
    return { visibility: 'ESTUDIANTES_Y_DOCENTES', onlyApproved: true };
  }
  return { visibility: queryVisibility, onlyApproved: false };
}

async function list(
  query: MaterialListQuery,
  viewer: MaterialViewer,
): Promise<Page<MaterialResource>> {
  const { items, total } = await MaterialRepo.findMany(
    query,
    scopeFor(viewer, query.visibility),
  );
  return {
    items: items.map(toMaterialResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(
  input: CreateMaterialRequest,
  file: Express.Multer.File | undefined,
  viewer: MaterialViewer,
): Promise<MaterialDetailResource> {
  if (viewer.role === 'ESTUDIANTE') {
    throw forbidden(ErrorCodes.FORBIDDEN_ROLE);
  }
  if (
    viewer.role === 'DOCENTE' &&
    !(await MaterialRepo.teacherAssigned(viewer.id, input.subjectId))
  ) {
    throw forbidden(ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT);
  }

  const missing: { field: string; message: string }[] = [];
  if (!(await MaterialRepo.subjectExists(input.subjectId))) {
    missing.push({
      field: 'subjectId',
      message: MaterialMessages.SUBJECT_NOT_FOUND,
    });
  }
  if (!(await MaterialRepo.academicPeriodExists(input.academicPeriodId))) {
    missing.push({
      field: 'academicPeriodId',
      message: MaterialMessages.PERIOD_NOT_FOUND,
    });
  }
  if (missing.length > 0) throw new ValidationError(missing);
  if (!file) {
    throw new RouteError(
      ErrorCodes.BAD_REQUEST,
      MaterialMessages.FILE_REQUIRED,
    );
  }

  const saved = await saveUpload(file);
  try {
    const { material, version } = await MaterialRepo.createWithVersion({
      material: {
        subjectId: input.subjectId,
        authorId: viewer.id,
        academicPeriodId: input.academicPeriodId,
        title: input.title,
        description: input.description ?? null,
        materialType: input.materialType,
        visibility: input.visibility,
        syllabusChangesNote: input.syllabusChangesNote ?? null,
      },
      version: {
        originalFileName: saved.originalFileName,
        storagePath: saved.storagePath,
        mimeType: saved.mimeType,
        fileSizeBytes: saved.fileSizeBytes,
        checksumSha256: saved.checksumSha256,
        changelog: input.changelog ?? null,
        uploadedBy: viewer.id,
      },
    });
    return {
      ...toMaterialResource(material),
      currentVersionDetail: toMaterialVersionResource(version),
    };
  } catch (err) {
    await removeUpload(saved.storagePath);
    throw err;
  }
}

async function getOne(
  id: number,
  viewer: MaterialViewer,
): Promise<MaterialDetailResource> {
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  const version = await MaterialRepo.findVersion(
    material.id,
    material.currentVersion,
  );
  if (!version) throw new NotFoundError(MaterialMessages.NOT_FOUND);
  return {
    ...toMaterialResource(material),
    currentVersionDetail: toMaterialVersionResource(version),
  };
}

async function update(
  id: number,
  input: UpdateMaterialRequest,
  viewer: MaterialViewer,
): Promise<MaterialResource> {
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  requireOwner(material, viewer);

  const { isApproved, ...rest } = input;
  const data: Prisma.MaterialUncheckedUpdateInput = { ...rest };
  // isApproved es exclusivo de ADMIN; si lo envía el autor se ignora.
  if (viewer.role === 'ADMIN' && isApproved !== undefined) {
    data.isApproved = isApproved;
  }
  return toMaterialResource(await MaterialRepo.update(id, data));
}

async function remove(id: number, viewer: MaterialViewer): Promise<void> {
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  requireOwner(material, viewer);
  await MaterialRepo.softDelete(id);
}

/** Prepara una descarga: valida acceso y archivo antes de contabilizarla. */
async function prepareDownload(
  id: number,
  viewer: MaterialViewer,
  versionNumber?: number,
) {
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  const version = await MaterialRepo.findVersion(
    material.id,
    versionNumber ?? material.currentVersion,
  );
  if (!version) {
    if (versionNumber !== undefined) {
      throw new RouteError(
        ErrorCodes.VERSION_NOT_FOUND,
        MaterialMessages.VERSION_NOT_FOUND,
      );
    }
    throw new NotFoundError(MaterialMessages.NOT_FOUND);
  }
  await assertUploadAvailable(version.storagePath);
  await MaterialRepo.incrementDownloadCount(material.id);
  return version;
}

async function listVersions(
  id: number,
  query: MaterialVersionListQuery,
  viewer: MaterialViewer,
): Promise<Page<MaterialVersionResource>> {
  if (viewer.role === 'ESTUDIANTE') {
    throw forbidden(ErrorCodes.FORBIDDEN_ROLE);
  }
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  const { items, total } = await MaterialRepo.findVersions(material.id, query);
  return {
    items: items.map(toMaterialVersionResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function getVersion(
  id: number,
  versionNumber: number,
  viewer: MaterialViewer,
): Promise<MaterialVersionResource> {
  if (viewer.role === 'ESTUDIANTE') {
    throw forbidden(ErrorCodes.FORBIDDEN_ROLE);
  }
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  const version = await MaterialRepo.findVersion(material.id, versionNumber);
  if (!version) {
    throw new RouteError(
      ErrorCodes.VERSION_NOT_FOUND,
      MaterialMessages.VERSION_NOT_FOUND,
    );
  }
  return toMaterialVersionResource(version);
}

async function addVersion(
  id: number,
  input: CreateMaterialVersionRequest,
  file: Express.Multer.File | undefined,
  viewer: MaterialViewer,
): Promise<VersionUploadResult> {
  if (viewer.role === 'ESTUDIANTE') {
    throw forbidden(ErrorCodes.FORBIDDEN_ROLE);
  }
  const material = requireVisible(
    await MaterialRepo.findAvailableById(id),
    viewer,
  );
  // La propiedad se comprueba antes que cualquier otra validación de contenido.
  requireOwner(material, viewer);
  if (
    viewer.role === 'DOCENTE' &&
    !(await MaterialRepo.teacherAssigned(viewer.id, material.subjectId))
  ) {
    throw forbidden(ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT);
  }
  if (!file) {
    throw new RouteError(
      ErrorCodes.BAD_REQUEST,
      MaterialMessages.FILE_REQUIRED,
    );
  }

  const saved = await saveUpload(file);
  try {
    const version = await MaterialRepo.addVersion(material.id, viewer.id, {
      originalFileName: saved.originalFileName,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      fileSizeBytes: saved.fileSizeBytes,
      checksumSha256: saved.checksumSha256,
      changelog: input.changelog ?? null,
    });
    if (!version) throw new NotFoundError(MaterialMessages.NOT_FOUND);
    return {
      version: toMaterialVersionResource(version),
      materialType: material.materialType as MaterialType,
    };
  } catch (err) {
    await removeUpload(saved.storagePath);
    throw err;
  }
}

export default {
  list,
  create,
  getOne,
  update,
  remove,
  prepareDownload,
  listVersions,
  getVersion,
  addVersion,
} as const;
