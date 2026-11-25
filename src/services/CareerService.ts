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
  type CareerListQuery,
  type CareerResource,
  type CreateCareerRequest,
  toCareerResource,
  type UpdateCareerRequest,
} from '#src/entities/Career/index.ts';
import CareerRepo from '#src/repos/CareerRepo.ts';
import InstituteRepo from '#src/repos/InstituteRepo.ts';

export const CareerMessages = {
  LISTED: 'Carreras obtenidas correctamente.',
  CREATED: 'Carrera creada correctamente.',
  FOUND: 'Carrera obtenida correctamente.',
  UPDATED: 'Carrera actualizada correctamente.',
  DELETED: 'Carrera eliminada correctamente.',
  NOT_FOUND: 'La carrera no existe.',
  INSTITUTE_NOT_FOUND: 'El instituto especificado no existe.',
  CODE_TAKEN: 'El código curricular ya está registrado en este instituto.',
  HAS_DEPENDENCIES:
    'No se puede eliminar la carrera porque tiene materias o usuarios asociados.',
} as const;

async function list(query: CareerListQuery): Promise<Page<CareerResource>> {
  const { items, total } = await CareerRepo.findMany(query);
  return {
    items: items.map(toCareerResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(input: CreateCareerRequest): Promise<CareerResource> {
  if (!(await InstituteRepo.findById(input.instituteId))) {
    throw new ValidationError([
      { field: 'instituteId', message: CareerMessages.INSTITUTE_NOT_FOUND },
    ]);
  }
  if (
    await CareerRepo.curriculumCodeTaken(
      input.instituteId,
      input.curriculumCode,
    )
  ) {
    throw new ConflictUniqueError(
      'curriculumCode',
      CareerMessages.CODE_TAKEN,
    );
  }
  try {
    const created = await CareerRepo.create(input);
    return toCareerResource(created);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError(
        'curriculumCode',
        CareerMessages.CODE_TAKEN,
      );
    }
    throw err;
  }
}

async function getOne(id: number): Promise<CareerResource> {
  const career = await CareerRepo.findById(id);
  if (!career) throw new NotFoundError(CareerMessages.NOT_FOUND);
  return toCareerResource(career);
}

async function update(
  id: number,
  input: UpdateCareerRequest,
): Promise<CareerResource> {
  const current = await CareerRepo.findById(id);
  if (!current) throw new NotFoundError(CareerMessages.NOT_FOUND);

  if (
    input.instituteId !== undefined &&
    !(await InstituteRepo.findById(input.instituteId))
  ) {
    throw new ValidationError([
      { field: 'instituteId', message: CareerMessages.INSTITUTE_NOT_FOUND },
    ]);
  }

  const nextInstituteId = input.instituteId ?? current.instituteId;
  const nextCode = input.curriculumCode ?? current.curriculumCode;

  if (
    (input.instituteId !== undefined || input.curriculumCode !== undefined) &&
    (await CareerRepo.curriculumCodeTaken(nextInstituteId, nextCode, id))
  ) {
    throw new ConflictUniqueError(
      'curriculumCode',
      CareerMessages.CODE_TAKEN,
    );
  }

  try {
    const updated = await CareerRepo.update(id, input);
    return toCareerResource(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError(
        'curriculumCode',
        CareerMessages.CODE_TAKEN,
      );
    }
    throw err;
  }
}

async function remove(id: number): Promise<void> {
  const career = await CareerRepo.findById(id);
  if (!career) throw new NotFoundError(CareerMessages.NOT_FOUND);

  if (await CareerRepo.hasDependencies(id)) {
    throw new RouteError(
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      CareerMessages.HAS_DEPENDENCIES,
    );
  }
  await CareerRepo.remove(id);
}

export default {
  list,
  create,
  getOne,
  update,
  remove,
} as const;
