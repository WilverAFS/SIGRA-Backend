import { type MaterialVersion, Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type {
  MaterialListQuery,
  MaterialVisibility,
  MaterialWithRelations,
} from '#src/entities/Material/index.ts';
import { materialRelations } from '#src/entities/Material/index.ts';
import type { MaterialVersionListQuery } from '#src/entities/MaterialVersion/index.ts';

// ========================================================================= //
//                                   TYPES                                    //
// ========================================================================= //

/** Restricciones de visibilidad que el servicio deriva del rol del token. */
export interface MaterialReadScope {
  visibility?: MaterialVisibility;
  onlyApproved: boolean;
}

interface CreateWithVersionInput {
  material: Prisma.MaterialUncheckedCreateInput;
  version: Omit<
    Prisma.MaterialVersionUncheckedCreateInput,
    'materialId' | 'versionNumber'
  >;
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Listado paginado. La búsqueda combina `ILIKE` (subcadenas) con texto
 * completo en español (`to_tsvector`/`plainto_tsquery`), de modo que
 * "planeacion" también encuentra "Planeación".
 */
async function findMany(
  query: MaterialListQuery,
  scope: MaterialReadScope,
): Promise<{ items: MaterialWithRelations[]; total: number }> {
  const { skip, take } = toSkipTake(query);
  // El ORDER BY se aplica sobre la CTE: los nombres van sin el alias `m`.
  const sortColumns = {
    createdAt: '"created_at"',
    title: '"title"',
    downloadCount: '"download_count"',
  } as const;
  const orderBy = `${sortColumns[query.sort.field]} ${
    query.sort.direction === 'desc' ? 'DESC' : 'ASC'
  }`;

  const search = query.search ?? null;
  const rows = await prisma.$queryRaw<{ id: number; total: bigint }[]>(
    Prisma.sql`
      WITH filtered AS (
        SELECT m.id, m."title", m."created_at", m."download_count"
        FROM materials m
        JOIN subjects s ON s.id = m.subject_id
        JOIN careers c ON c.id = s.career_id
        WHERE m.deleted_at IS NULL
          AND (${query.instituteId ?? null}::int IS NULL OR c.institute_id = ${query.instituteId ?? null}::int)
          AND (${query.subjectId ?? null}::int IS NULL OR m.subject_id = ${query.subjectId ?? null}::int)
          AND (${query.academicPeriodId ?? null}::int IS NULL OR m.academic_period_id = ${query.academicPeriodId ?? null}::int)
          AND (${query.authorId ?? null}::int IS NULL OR m.author_id = ${query.authorId ?? null}::int)
          AND (${query.materialType ?? null}::text IS NULL OR m.material_type = ${query.materialType ?? null}::text)
          AND (${scope.visibility ?? null}::text IS NULL OR m.visibility = ${scope.visibility ?? null}::text)
          AND (${scope.onlyApproved}::boolean = false OR m.is_approved = true)
          AND (
            ${search}::text IS NULL
            OR m.title ILIKE '%' || ${search} || '%'
            OR COALESCE(m.description, '') ILIKE '%' || ${search} || '%'
            OR to_tsvector('spanish', COALESCE(m.title, '') || ' ' || COALESCE(m.description, ''))
               @@ plainto_tsquery('spanish', ${search})
          )
      ), counted AS (
        SELECT filtered.*, COUNT(*) OVER() AS total FROM filtered
      )
      SELECT id, total FROM counted
      ORDER BY ${Prisma.raw(orderBy)}, id ASC
      LIMIT ${take} OFFSET ${skip}
    `,
  );

  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  const found = await prisma.material.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: materialRelations,
  });
  const byId = new Map(found.map((material) => [material.id, material]));
  const items = rows
    .map((row) => byId.get(row.id))
    .filter((material): material is MaterialWithRelations => !!material);
  return { items, total };
}

function findAvailableById(id: number): Promise<MaterialWithRelations | null> {
  return prisma.material.findFirst({
    where: { id, deletedAt: null },
    include: materialRelations,
  });
}

function findVersion(
  materialId: number,
  versionNumber: number,
): Promise<MaterialVersion | null> {
  return prisma.materialVersion.findUnique({
    where: {
      materialId_versionNumber: { materialId, versionNumber },
    },
  });
}

async function findVersions(
  materialId: number,
  query: MaterialVersionListQuery,
): Promise<{ items: MaterialVersion[]; total: number }> {
  const where: Prisma.MaterialVersionWhereInput = { materialId };
  const orderBy: Prisma.MaterialVersionOrderByWithRelationInput[] = [
    { [query.sort.field]: query.sort.direction },
    { id: 'asc' },
  ];
  const [items, total] = await prisma.$transaction([
    prisma.materialVersion.findMany({ where, orderBy, ...toSkipTake(query) }),
    prisma.materialVersion.count({ where }),
  ]);
  return { items, total };
}

/** Material y versión 1 se crean juntos; la versión sigue a `currentVersion`. */
function createWithVersion(
  input: CreateWithVersionInput,
): Promise<{ material: MaterialWithRelations; version: MaterialVersion }> {
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.create({
      data: input.material,
      include: materialRelations,
    });
    const version = await tx.materialVersion.create({
      data: {
        ...input.version,
        materialId: material.id,
        versionNumber: material.currentVersion,
      },
    });
    return { material, version };
  });
}

/** Agrega `currentVersion + 1` y avanza el material en la misma transacción. */
async function addVersion(
  materialId: number,
  uploadedBy: number,
  file: Omit<
    Prisma.MaterialVersionUncheckedCreateInput,
    'materialId' | 'versionNumber' | 'uploadedBy'
  >,
): Promise<MaterialVersion | null> {
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findUnique({
      where: { id: materialId },
    });
    if (!material || material.deletedAt) return null;
    const versionNumber = material.currentVersion + 1;
    const version = await tx.materialVersion.create({
      data: {
        ...file,
        materialId,
        uploadedBy,
        versionNumber,
      },
    });
    await tx.material.update({
      where: { id: materialId },
      data: { currentVersion: versionNumber },
    });
    return version;
  });
}

function update(
  id: number,
  data: Prisma.MaterialUncheckedUpdateInput,
): Promise<MaterialWithRelations> {
  return prisma.material.update({
    where: { id },
    data,
    include: materialRelations,
  });
}

async function softDelete(id: number): Promise<void> {
  await prisma.material.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

async function incrementDownloadCount(id: number): Promise<void> {
  await prisma.material.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });
}

async function subjectExists(id: number): Promise<boolean> {
  return (await prisma.subject.count({ where: { id } })) > 0;
}

async function academicPeriodExists(id: number): Promise<boolean> {
  return (await prisma.academicPeriod.count({ where: { id } })) > 0;
}

/** Una asignación vigente (no borrada físicamente) vincula docente y materia. */
async function teacherAssigned(
  teacherId: number,
  subjectId: number,
): Promise<boolean> {
  return (
    (await prisma.subjectAssignment.count({
      where: { teacherId, subjectId },
    })) > 0
  );
}

export default {
  findMany,
  findAvailableById,
  findVersion,
  findVersions,
  createWithVersion,
  addVersion,
  update,
  softDelete,
  incrementDownloadCount,
  subjectExists,
  academicPeriodExists,
  teacherAssigned,
} as const;
