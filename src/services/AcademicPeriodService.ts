import { Prisma } from '@prisma/client';

import {
  ConflictUniqueError,
  NotFoundError,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import {
  type AcademicPeriodListQuery,
  type AcademicPeriodResource,
  type CreateAcademicPeriodRequest,
  toAcademicPeriodResource,
  type UpdateAcademicPeriodRequest,
} from '#src/entities/AcademicPeriod/index.ts';
import AcademicPeriodRepo from '#src/repos/AcademicPeriodRepo.ts';

export const AcademicPeriodMessages = {
  LISTED: 'Periodos académicos obtenidos correctamente.',
  CREATED: 'Periodo académico creado correctamente.',
  FOUND: 'Periodo académico obtenido correctamente.',
  CURRENT_FOUND: 'Periodo vigente obtenido correctamente.',
  UPDATED: 'Periodo académico actualizado correctamente.',
  SET_CURRENT: 'Periodo académico fijado como vigente correctamente.',
  DELETED: 'Periodo académico eliminado correctamente.',
  NOT_FOUND: 'El periodo académico no existe.',
  NO_CURRENT: 'No hay un periodo académico fijado como vigente.',
  CODE_TAKEN: 'El código de periodo ya está registrado.',
  INVALID_DATES: 'endDate debe ser posterior a startDate.',
  ALREADY_CURRENT: 'El periodo académico ya está fijado como vigente.',
  HAS_DEPENDENCIES:
    'No se puede eliminar el periodo porque tiene asignaciones o materiales asociados.',
} as const;

async function list(
  query: AcademicPeriodListQuery,
): Promise<Page<AcademicPeriodResource>> {
  const { items, total } = await AcademicPeriodRepo.findMany(query);
  return {
    items: items.map(toAcademicPeriodResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(
  input: CreateAcademicPeriodRequest,
): Promise<AcademicPeriodResource> {
  if (await AcademicPeriodRepo.codeTaken(input.code)) {
    throw new ConflictUniqueError('code', AcademicPeriodMessages.CODE_TAKEN);
  }
  try {
    return toAcademicPeriodResource(await AcademicPeriodRepo.create(input));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', AcademicPeriodMessages.CODE_TAKEN);
    }
    throw err;
  }
}

async function getCurrent(): Promise<AcademicPeriodResource> {
  const period = await AcademicPeriodRepo.findCurrent();
  if (!period) throw new NotFoundError(AcademicPeriodMessages.NO_CURRENT);
  return toAcademicPeriodResource(period);
}

async function getOne(id: number): Promise<AcademicPeriodResource> {
  const period = await AcademicPeriodRepo.findById(id);
  if (!period) throw new NotFoundError(AcademicPeriodMessages.NOT_FOUND);
  return toAcademicPeriodResource(period);
}

async function update(
  id: number,
  input: UpdateAcademicPeriodRequest,
): Promise<AcademicPeriodResource> {
  const current = await AcademicPeriodRepo.findById(id);
  if (!current) throw new NotFoundError(AcademicPeriodMessages.NOT_FOUND);

  const startDate =
    input.startDate ?? current.startDate.toISOString().slice(0, 10);
  const endDate = input.endDate ?? current.endDate.toISOString().slice(0, 10);
  if (endDate <= startDate) {
    throw new ValidationError([
      { field: 'endDate', message: AcademicPeriodMessages.INVALID_DATES },
    ]);
  }

  if (
    input.code !== undefined &&
    (await AcademicPeriodRepo.codeTaken(input.code, id))
  ) {
    throw new ConflictUniqueError('code', AcademicPeriodMessages.CODE_TAKEN);
  }

  try {
    return toAcademicPeriodResource(await AcademicPeriodRepo.update(id, input));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', AcademicPeriodMessages.CODE_TAKEN);
    }
    throw err;
  }
}

/** 6.5.6: solo esta operación cambia `isCurrent`, de forma atómica. */
async function setCurrent(id: number): Promise<AcademicPeriodResource> {
  const current = await AcademicPeriodRepo.findById(id);
  if (!current) throw new NotFoundError(AcademicPeriodMessages.NOT_FOUND);
  if (current.isCurrent) {
    throw new RouteError(
      ErrorCodes.PERIOD_ALREADY_CURRENT,
      AcademicPeriodMessages.ALREADY_CURRENT,
    );
  }
  const updated = await AcademicPeriodRepo.setCurrent(id);
  if (!updated) throw new NotFoundError(AcademicPeriodMessages.NOT_FOUND);
  return toAcademicPeriodResource(updated);
}

async function remove(id: number): Promise<void> {
  if (!(await AcademicPeriodRepo.findById(id))) {
    throw new NotFoundError(AcademicPeriodMessages.NOT_FOUND);
  }
  if (await AcademicPeriodRepo.hasDependencies(id)) {
    throw new RouteError(
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      AcademicPeriodMessages.HAS_DEPENDENCIES,
    );
  }
  await AcademicPeriodRepo.remove(id);
}

export default {
  list,
  create,
  getCurrent,
  getOne,
  update,
  setCurrent,
  remove,
} as const;
