import {
  ConflictUniqueError,
  type ErrorDetail,
  NotFoundError,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import { hashPassword } from '#src/common/utils/password.utils.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import {
  type CreateUserRequest,
  type RoleName,
  toUserResource,
  type UpdateUserRequest,
  type UserListQuery,
  type UserResource,
} from '#src/entities/User/index.ts';
import UserRepo from '#src/repos/UserRepo.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const UserMessages = {
  LISTED: 'Usuarios obtenidos correctamente.',
  CREATED: 'Usuario creado correctamente.',
  FOUND: 'Usuario obtenido correctamente.',
  UPDATED: 'Usuario actualizado correctamente.',
  DELETED: 'Usuario eliminado correctamente.',
  NOT_FOUND: 'El usuario no existe.',
  EMAIL_TAKEN: 'El correo ya está registrado.',
  INSTITUTIONAL_ID_TAKEN:
    'El identificador institucional ya está registrado en este instituto.',
  ROLE_NOT_FOUND: 'El rol no existe en el catálogo.',
  INSTITUTE_NOT_FOUND: 'El instituto no existe.',
  CAREER_NOT_FOUND: 'La carrera no existe en el instituto del usuario.',
  CAREER_REQUIRED: 'La carrera es obligatoria para DOCENTE y ESTUDIANTE.',
  LAST_ADMIN:
    'No se puede eliminar al último administrador activo del sistema.',
} as const;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Validar referencias (rol, instituto y carrera) contra la BD → 422.
 */
async function checkReferences(input: {
  role?: RoleName;
  instituteId: number;
  careerId?: number | null;
  checkInstitute?: boolean;
}): Promise<number | undefined> {
  const details: ErrorDetail[] = [];
  let roleId: number | undefined;
  if (input.role) {
    roleId = (await UserRepo.findRoleId(input.role)) ?? undefined;
    if (roleId === undefined) {
      details.push({ field: 'role', message: UserMessages.ROLE_NOT_FOUND });
    }
  }
  if (
    input.checkInstitute &&
    !(await UserRepo.instituteExists(input.instituteId))
  ) {
    details.push({
      field: 'instituteId',
      message: UserMessages.INSTITUTE_NOT_FOUND,
    });
  } else if (
    input.careerId != null &&
    !(await UserRepo.careerExistsInInstitute(input.careerId, input.instituteId))
  ) {
    details.push({ field: 'careerId', message: UserMessages.CAREER_NOT_FOUND });
  }
  if (details.length > 0) throw new ValidationError(details);
  return roleId;
}

/**
 * Validar unicidad de correo e identificador institucional → 409.
 */
async function checkUnique(input: {
  email?: string;
  instituteId: number;
  institutionalId?: string;
  exceptId?: number;
}): Promise<void> {
  if (input.email && (await UserRepo.emailTaken(input.email, input.exceptId))) {
    throw new ConflictUniqueError('email', UserMessages.EMAIL_TAKEN);
  }
  if (
    input.institutionalId &&
    (await UserRepo.institutionalIdTaken(
      input.instituteId,
      input.institutionalId,
      input.exceptId,
    ))
  ) {
    throw new ConflictUniqueError(
      'institutionalId',
      UserMessages.INSTITUTIONAL_ID_TAKEN,
    );
  }
}

/** 6.2.1 Listar usuarios. */
async function list(query: UserListQuery): Promise<Page<UserResource>> {
  const { items, total } = await UserRepo.findMany(query);
  return {
    items: items.map(toUserResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/** 6.2.2 Crear usuario (alta administrativa, sin tokens). */
async function create(input: CreateUserRequest): Promise<UserResource> {
  const roleId = await checkReferences({
    role: input.role,
    instituteId: input.instituteId,
    careerId: input.careerId,
    checkInstitute: true,
  });
  await checkUnique(input);
  const user = await UserRepo.create({
    roleId: roleId!,
    instituteId: input.instituteId,
    careerId: input.careerId ?? null,
    institutionalId: input.institutionalId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    isActive: true,
  });
  return toUserResource(user);
}

/** 6.2.3 Obtener usuario. */
async function getOne(id: number): Promise<UserResource> {
  const user = await UserRepo.findById(id);
  if (!user) throw new NotFoundError(UserMessages.NOT_FOUND);
  return toUserResource(user);
}

/** 6.2.4 Actualizar usuario (parcial). */
async function update(
  id: number,
  input: UpdateUserRequest,
): Promise<UserResource> {
  const current = await UserRepo.findById(id);
  if (!current) throw new NotFoundError(UserMessages.NOT_FOUND);
  const nextRole = input.role ?? (current.role.name as RoleName);
  const nextCareerId =
    input.careerId === undefined ? current.careerId : input.careerId;
  if (nextRole !== 'ADMIN' && nextCareerId === null) {
    throw new ValidationError([
      { field: 'careerId', message: UserMessages.CAREER_REQUIRED },
    ]);
  }
  const roleId = await checkReferences({
    role: input.role,
    instituteId: current.instituteId,
    careerId: input.careerId,
  });
  await checkUnique({
    email: input.email,
    institutionalId: input.institutionalId,
    instituteId: current.instituteId,
    exceptId: id,
  });
  const user = await UserRepo.update(id, {
    roleId,
    careerId: input.careerId,
    institutionalId: input.institutionalId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    isActive: input.isActive,
  });
  return toUserResource(user);
}

/**
 * 6.2.5 Eliminar usuario (baja lógica). No se puede dejar el sistema sin
 * administradores activos.
 *
 * TODO(BE #5): impedir que el usuario autenticado elimine su propia cuenta
 * cuando exista el middleware de autenticación.
 */
async function remove(id: number): Promise<void> {
  const user = await UserRepo.findById(id);
  if (!user) throw new NotFoundError(UserMessages.NOT_FOUND);
  if (
    user.role.name === 'ADMIN' &&
    user.isActive &&
    (await UserRepo.countActiveAdmins()) <= 1
  ) {
    throw new RouteError(
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      UserMessages.LAST_ADMIN,
    );
  }
  await UserRepo.softDelete(id);
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default {
  list,
  create,
  getOne,
  update,
  remove,
} as const;
