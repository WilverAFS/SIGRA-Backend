import { Prisma } from '@prisma/client';

import {
  NotFoundError,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import {
  type CreateSubjectAssignmentRequest,
  type SubjectAssignmentListQuery,
  type SubjectAssignmentResource,
  toSubjectAssignmentResource,
} from '#src/entities/SubjectAssignment/index.ts';
import type { RoleName } from '#src/entities/User/index.ts';
import AcademicPeriodRepo from '#src/repos/AcademicPeriodRepo.ts';
import SubjectAssignmentRepo from '#src/repos/SubjectAssignmentRepo.ts';
import SubjectRepo from '#src/repos/SubjectRepo.ts';

export const SubjectAssignmentMessages = {
  LISTED: 'Asignaciones obtenidas correctamente.',
  CREATED: 'Asignación creada correctamente.',
  FOUND: 'Asignación obtenida correctamente.',
  DELETED: 'Asignación eliminada correctamente.',
  NOT_FOUND: 'La asignación no existe.',
  SUBJECT_NOT_FOUND: 'La materia especificada no existe.',
  PERIOD_NOT_FOUND: 'El periodo académico especificado no existe.',
  TEACHER_INVALID:
    'teacherId debe corresponder a un usuario activo con rol DOCENTE.',
  DUPLICATED:
    'Ya existe una asignación con esa materia, docente, periodo y grupo.',
  FORBIDDEN_ROLE:
    'No tienes permisos para acceder a las asignaciones de carga académica.',
  FORBIDDEN_OWNERSHIP:
    'No tienes permisos para ver una asignación de otro docente.',
} as const;

/** Datos del usuario del token que determinan el alcance de la consulta. */
export interface AssignmentViewer {
  id: number;
  role: RoleName;
}

async function list(
  query: SubjectAssignmentListQuery,
  viewer: AssignmentViewer,
): Promise<Page<SubjectAssignmentResource>> {
  if (viewer.role === 'ESTUDIANTE') {
    throw new RouteError(
      ErrorCodes.FORBIDDEN_ROLE,
      SubjectAssignmentMessages.FORBIDDEN_ROLE,
    );
  }
  // Un DOCENTE ve solo las suyas, aunque pida otro teacherId (contrato 6.7.1).
  const forcedTeacherId = viewer.role === 'DOCENTE' ? viewer.id : undefined;
  const { items, total } = await SubjectAssignmentRepo.findMany(
    query,
    forcedTeacherId,
  );
  return {
    items: items.map(toSubjectAssignmentResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(
  input: CreateSubjectAssignmentRequest,
  assignedBy: number,
): Promise<SubjectAssignmentResource> {
  if (!(await SubjectAssignmentRepo.teacherIsActiveDocente(input.teacherId))) {
    throw new ValidationError([
      {
        field: 'teacherId',
        message: SubjectAssignmentMessages.TEACHER_INVALID,
      },
    ]);
  }
  if (!(await SubjectRepo.findById(input.subjectId))) {
    throw new ValidationError([
      {
        field: 'subjectId',
        message: SubjectAssignmentMessages.SUBJECT_NOT_FOUND,
      },
    ]);
  }
  if (!(await AcademicPeriodRepo.findById(input.academicPeriodId))) {
    throw new ValidationError([
      {
        field: 'academicPeriodId',
        message: SubjectAssignmentMessages.PERIOD_NOT_FOUND,
      },
    ]);
  }
  if (
    await SubjectAssignmentRepo.duplicated(
      input.subjectId,
      input.teacherId,
      input.academicPeriodId,
      input.groupCode,
    )
  ) {
    throw new RouteError(
      ErrorCodes.ASSIGNMENT_DUPLICATED,
      SubjectAssignmentMessages.DUPLICATED,
    );
  }
  try {
    return toSubjectAssignmentResource(
      await SubjectAssignmentRepo.create({ ...input, assignedBy }),
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new RouteError(
        ErrorCodes.ASSIGNMENT_DUPLICATED,
        SubjectAssignmentMessages.DUPLICATED,
      );
    }
    throw err;
  }
}

async function getOne(
  id: number,
  viewer: AssignmentViewer,
): Promise<SubjectAssignmentResource> {
  const assignment = await SubjectAssignmentRepo.findById(id);
  if (!assignment) throw new NotFoundError(SubjectAssignmentMessages.NOT_FOUND);

  if (viewer.role === 'ESTUDIANTE') {
    throw new RouteError(
      ErrorCodes.FORBIDDEN_ROLE,
      SubjectAssignmentMessages.FORBIDDEN_ROLE,
    );
  }
  if (viewer.role === 'DOCENTE' && assignment.teacherId !== viewer.id) {
    throw new RouteError(
      ErrorCodes.FORBIDDEN_OWNERSHIP,
      SubjectAssignmentMessages.FORBIDDEN_OWNERSHIP,
    );
  }
  return toSubjectAssignmentResource(assignment);
}

async function remove(id: number): Promise<void> {
  if (!(await SubjectAssignmentRepo.findById(id))) {
    throw new NotFoundError(SubjectAssignmentMessages.NOT_FOUND);
  }
  await SubjectAssignmentRepo.remove(id);
}

export default { list, create, getOne, remove } as const;
