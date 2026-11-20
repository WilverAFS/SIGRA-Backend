import type { Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type {
  RoleName,
  UserListQuery,
  UserWithRole,
} from '#src/entities/User/index.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const withRole = { role: true } as const;

/** Solo usuarios sin baja lógica (contrato 6.2.3). */
const notDeleted = { deletedAt: null } as const;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Lista paginada con filtros, búsqueda y orden (contrato 6.2.1).
 */
async function findMany(
  query: UserListQuery,
): Promise<{ items: UserWithRole[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...notDeleted,
    roleId: query.roleId,
    role: query.role ? { name: query.role } : undefined,
    careerId: query.careerId,
    instituteId: query.instituteId,
    isActive: query.isActive,
    OR: query.search
      ? [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          {
            institutionalId: { contains: query.search, mode: 'insensitive' },
          },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: withRole,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

function findById(id: number): Promise<UserWithRole | null> {
  return prisma.user.findFirst({
    where: { id, ...notDeleted },
    include: withRole,
  });
}

function create(data: Prisma.UserUncheckedCreateInput): Promise<UserWithRole> {
  return prisma.user.create({ data, include: withRole });
}

function update(
  id: number,
  data: Prisma.UserUncheckedUpdateInput,
): Promise<UserWithRole> {
  return prisma.user.update({ where: { id }, data, include: withRole });
}

/** Baja lógica: se registra la fecha y se desactiva la cuenta. */
async function softDelete(id: number): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

/** ¿El correo ya lo usa otra cuenta? (incluye bajas lógicas: es único) */
async function emailTaken(email: string, exceptId?: number): Promise<boolean> {
  const found = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

/** ¿El identificador institucional ya existe en ese instituto? */
async function institutionalIdTaken(
  instituteId: number,
  institutionalId: string,
  exceptId?: number,
): Promise<boolean> {
  const found = await prisma.user.findUnique({
    where: {
      instituteId_institutionalId: { instituteId, institutionalId },
    },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

/** Administradores activos, sin contar bajas lógicas. */
function countActiveAdmins(): Promise<number> {
  return prisma.user.count({
    where: { ...notDeleted, isActive: true, role: { name: 'ADMIN' } },
  });
}

async function findRoleId(name: RoleName): Promise<number | null> {
  const role = await prisma.role.findUnique({
    where: { name },
    select: { id: true },
  });
  return role?.id ?? null;
}

async function instituteExists(id: number): Promise<boolean> {
  return (await prisma.institute.count({ where: { id } })) > 0;
}

async function careerExistsInInstitute(
  careerId: number,
  instituteId: number,
): Promise<boolean> {
  return (
    (await prisma.career.count({ where: { id: careerId, instituteId } })) > 0
  );
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default {
  findMany,
  findById,
  create,
  update,
  softDelete,
  emailTaken,
  institutionalIdTaken,
  countActiveAdmins,
  findRoleId,
  instituteExists,
  careerExistsInInstitute,
} as const;
