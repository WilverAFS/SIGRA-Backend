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
  type CreateSubjectRequest,
  type SubjectListQuery,
  type SubjectResource,
  toSubjectResource,
  totalCreditsOf,
  type UpdateSubjectRequest,
} from '#src/entities/Subject/index.ts';
import SubjectRepo from '#src/repos/SubjectRepo.ts';

export const SubjectMessages = {
  LISTED: 'Materias obtenidas correctamente.',
  CREATED: 'Materia creada correctamente.',
  FOUND: 'Materia obtenida correctamente.',
  UPDATED: 'Materia actualizada correctamente.',
  DELETED: 'Materia eliminada correctamente.',
  NOT_FOUND: 'La materia no existe.',
  CAREER_NOT_FOUND: 'La carrera especificada no existe.',
  CODE_TAKEN: 'El código de materia ya está registrado en esta carrera.',
  HAS_DEPENDENCIES:
    'No se puede eliminar la materia porque tiene asignaciones o materiales asociados.',
} as const;

async function list(query: SubjectListQuery): Promise<Page<SubjectResource>> {
  const { items, total } = await SubjectRepo.findMany(query);
  return {
    items: items.map(toSubjectResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(input: CreateSubjectRequest): Promise<SubjectResource> {
  if (!(await SubjectRepo.careerExists(input.careerId))) {
    throw new ValidationError([
      { field: 'careerId', message: SubjectMessages.CAREER_NOT_FOUND },
    ]);
  }
  if (await SubjectRepo.codeTaken(input.careerId, input.code)) {
    throw new ConflictUniqueError('code', SubjectMessages.CODE_TAKEN);
  }
  try {
    return toSubjectResource(
      await SubjectRepo.create({
        ...input,
        totalCredits: totalCreditsOf(input),
      }),
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', SubjectMessages.CODE_TAKEN);
    }
    throw err;
  }
}

async function getOne(id: number): Promise<SubjectResource> {
  const subject = await SubjectRepo.findById(id);
  if (!subject) throw new NotFoundError(SubjectMessages.NOT_FOUND);
  return toSubjectResource(subject);
}

async function update(
  id: number,
  input: UpdateSubjectRequest,
): Promise<SubjectResource> {
  const current = await SubjectRepo.findById(id);
  if (!current) throw new NotFoundError(SubjectMessages.NOT_FOUND);

  const careerId = input.careerId ?? current.careerId;
  const code = input.code ?? current.code;
  if (
    input.careerId !== undefined &&
    !(await SubjectRepo.careerExists(input.careerId))
  ) {
    throw new ValidationError([
      { field: 'careerId', message: SubjectMessages.CAREER_NOT_FOUND },
    ]);
  }
  if (
    (input.careerId !== undefined || input.code !== undefined) &&
    (await SubjectRepo.codeTaken(careerId, code, id))
  ) {
    throw new ConflictUniqueError('code', SubjectMessages.CODE_TAKEN);
  }

  const creditsTheory = input.creditsTheory ?? current.creditsTheory;
  const creditsPractice = input.creditsPractice ?? current.creditsPractice;
  try {
    return toSubjectResource(
      await SubjectRepo.update(id, {
        ...input,
        totalCredits: creditsTheory + creditsPractice,
      }),
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictUniqueError('code', SubjectMessages.CODE_TAKEN);
    }
    throw err;
  }
}

async function remove(id: number): Promise<void> {
  if (!(await SubjectRepo.findById(id))) {
    throw new NotFoundError(SubjectMessages.NOT_FOUND);
  }
  if (await SubjectRepo.hasDependencies(id)) {
    throw new RouteError(
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      SubjectMessages.HAS_DEPENDENCIES,
    );
  }
  await SubjectRepo.remove(id);
}

export default { list, create, getOne, update, remove } as const;
