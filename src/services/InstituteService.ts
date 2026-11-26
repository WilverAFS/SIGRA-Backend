import { Prisma } from '@prisma/client';

import {
  ConflictUniqueError,
  NotFoundError,
  RouteError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import {
  type CreateInstituteRequest,
  type InstituteListQuery,
  type InstituteResource,
  toInstituteResource,
  type UpdateInstituteRequest,
} from '#src/entities/Institute/index.ts';
import InstituteRepo from '#src/repos/InstituteRepo.ts';

export const InstituteMessages = {
  LISTED: 'Institutos obtenidos correctamente.',
  CREATED: 'Instituto creado correctamente.',
  FOUND: 'Instituto obtenido correctamente.',
  UPDATED: 'Instituto actualizado correctamente.',
  DELETED: 'Instituto eliminado correctamente.',
  NOT_FOUND: 'El instituto no existe.',
  CODE_TAKEN: 'El código de instituto ya está registrado.',
  HAS_DEPENDENCIES:
    'No se puede eliminar el instituto porque tiene carreras o usuarios asociados.',
} as const;

async function list(
  query: InstituteListQuery,
): Promise<Page<InstituteResource>> {
  const { items, total } = await InstituteRepo.findMany(query);
  return {
    items: items.map(toInstituteResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(
  input: CreateInstituteRequest,
): Promise<InstituteResource> {
  if (await InstituteRepo.codeTaken(input.code)) {
    throw new ConflictUniqueError('code', InstituteMessages.CODE_TAKEN);
  }
  try {
    const created = await InstituteRepo.create(input);
    return toInstituteResource(created);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', InstituteMessages.CODE_TAKEN);
    }
    throw err;
  }
}

async function getOne(id: number): Promise<InstituteResource> {
  const institute = await InstituteRepo.findById(id);
  if (!institute) throw new NotFoundError(InstituteMessages.NOT_FOUND);
  return toInstituteResource(institute);
}

async function update(
  id: number,
  input: UpdateInstituteRequest,
): Promise<InstituteResource> {
  const current = await InstituteRepo.findById(id);
  if (!current) throw new NotFoundError(InstituteMessages.NOT_FOUND);

  if (input.code && (await InstituteRepo.codeTaken(input.code, id))) {
    throw new ConflictUniqueError('code', InstituteMessages.CODE_TAKEN);
  }
  try {
    const updated = await InstituteRepo.update(id, input);
    return toInstituteResource(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', InstituteMessages.CODE_TAKEN);
    }
    throw err;
  }
}

async function remove(id: number): Promise<void> {
  const institute = await InstituteRepo.findById(id);
  if (!institute) throw new NotFoundError(InstituteMessages.NOT_FOUND);

  if (await InstituteRepo.hasDependencies(id)) {
    throw new RouteError(
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      InstituteMessages.HAS_DEPENDENCIES,
    );
  }
  await InstituteRepo.remove(id);
}

export default {
  list,
  create,
  getOne,
  update,
  remove,
} as const;
