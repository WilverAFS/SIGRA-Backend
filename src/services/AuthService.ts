import {
  ConflictUniqueError,
  type ErrorDetail,
  NotFoundError,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  type AccessTokenPayload,
  blacklistAccessToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  signAccessToken,
  signAndStoreRefreshToken,
  verifyRefreshToken,
} from '#src/common/utils/jwt.utils.ts';
import {
  hashPassword,
  verifyPassword,
} from '#src/common/utils/password.utils.ts';
import type {
  AuthSessionResource,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
} from '#src/entities/Auth/index.ts';
import {
  type RoleName,
  toUserResource,
  type UserResource,
  type UserWithRole,
} from '#src/entities/User/index.ts';
import UserRepo from '#src/repos/UserRepo.ts';
import jwt  from 'jsonwebtoken';

export const AuthMessages = {
  REGISTERED_ACTIVE: 'Registro completado correctamente.',
  REGISTERED_PENDING:
    'Registro completado. Tu cuenta de docente queda pendiente de activación por un administrador.',
  LOGGED_IN: 'Inicio de sesión exitoso.',
  LOGGED_OUT: 'Sesión cerrada correctamente.',
  REFRESHED: 'Token renovado correctamente.',
  ME: 'Perfil obtenido correctamente.',
  PASSWORD_CHANGED: 'Contraseña actualizada correctamente.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  USER_INACTIVE:
    'Tu cuenta está inactiva o pendiente de activación por un administrador.',
  INVALID_REFRESH: 'El refresh token es inválido o ha expirado.',
  REVOKED_REFRESH: 'El refresh token ya fue utilizado o revocado.',
  WRONG_CURRENT_PASSWORD: 'La contraseña actual es incorrecta.',
  EMAIL_TAKEN: 'El correo ya está registrado.',
  INSTITUTIONAL_ID_TAKEN:
    'El identificador institucional ya está registrado en este instituto.',
  ROLE_NOT_FOUND: 'El rol no existe en el catálogo.',
  INSTITUTE_NOT_FOUND: 'El instituto no existe.',
  CAREER_NOT_FOUND: 'La carrera no existe en el instituto seleccionado.',
} as const;

async function buildSession(
  user: UserWithRole,
  includeUser = true,
): Promise<AuthSessionResource> {
  const role = user.role.name as RoleName;
  const accessToken = signAccessToken(user.id, role);
  const refreshToken = await signAndStoreRefreshToken(user.id);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    ...(includeUser ? { user: toUserResource(user) } : {}),
  };
}

function findUserByEmail(value: unknown, email: string): UserWithRole | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const user = findUserByEmail(item, email);
      if (user) return user;
    }
    return undefined;
  }

  if (typeof value !== 'object' || value === null) return undefined;
  if (
    'email' in value &&
    value.email === email &&
    'passwordHash' in value &&
    'isActive' in value &&
    'role' in value &&
    'id' in value
  ) {
    return value as UserWithRole;
  }

  for (const item of Object.values(value)) {
    const user = findUserByEmail(item, email);
    if (user) return user;
  }
  return undefined;
}

/** 6.1.1 Registro */
async function register(
  input: RegisterRequest,
): Promise<{
  session?: AuthSessionResource;
  user?: UserResource;
  isActive: boolean;
}> {
  const details: ErrorDetail[] = [];
  const roleId = await UserRepo.findRoleId(input.role);
  if (roleId === null) {
    details.push({ field: 'role', message: AuthMessages.ROLE_NOT_FOUND });
  }
  if (!(await UserRepo.instituteExists(input.instituteId))) {
    details.push({
      field: 'instituteId',
      message: AuthMessages.INSTITUTE_NOT_FOUND,
    });
  } else if (
    !(await UserRepo.careerExistsInInstitute(input.careerId, input.instituteId))
  ) {
    details.push({ field: 'careerId', message: AuthMessages.CAREER_NOT_FOUND });
  }
  if (details.length > 0) throw new ValidationError(details);

  if (await UserRepo.emailTaken(input.email)) {
    throw new ConflictUniqueError('email', AuthMessages.EMAIL_TAKEN);
  }
  if (
    await UserRepo.institutionalIdTaken(
      input.instituteId,
      input.institutionalId,
    )
  ) {
    throw new ConflictUniqueError(
      'institutionalId',
      AuthMessages.INSTITUTIONAL_ID_TAKEN,
    );
  }

  // ESTUDIANTE nace activo; DOCENTE nace inactivo sin tokens
  const isActive = input.role === 'ESTUDIANTE';

  const created = await UserRepo.create({
    roleId: roleId!,
    instituteId: input.instituteId,
    careerId: input.careerId,
    institutionalId: input.institutionalId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    isActive,
  });

  if (!isActive) {
    return { user: toUserResource(created), isActive: false };
  }

  const updated = await UserRepo.update(created.id, {
    lastLoginAt: new Date(),
  });
  return {
    session: await buildSession(updated, true),
    isActive: true,
  };
}

/** 6.1.2 Inicio de sesión */
async function login(input: LoginRequest): Promise<AuthSessionResource> {
  const result: unknown = await UserRepo.findMany({
    page: 1,
    limit: 1000,
    search: input.email,
    sort: { field: 'lastName', direction: 'asc' },
  });
  const user = findUserByEmail(result, input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new RouteError(
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      AuthMessages.INVALID_CREDENTIALS,
    );
  }
  if (!user.isActive) {
    throw new RouteError(
      ErrorCodes.AUTH_USER_INACTIVE,
      AuthMessages.USER_INACTIVE,
    );
  }

  const updated = await UserRepo.update(user.id, { lastLoginAt: new Date() });
  return buildSession(updated, true);
}

/** 6.1.3 Cierre de sesión */
async function logout(
  tokenPayload: AccessTokenPayload,
  refreshToken?: string,
): Promise<void> {
  await blacklistAccessToken(tokenPayload.jti, tokenPayload.exp);
  if (refreshToken) {
    try {
      const refreshPayload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(refreshPayload.jti);
    } catch {
      // Si el refreshToken ya expiró o es inválido, igual cerramos la sesión
    }
  }
}

/** 6.1.4 Renovar access token (con rotación) */
async function refresh(refreshToken: string): Promise<AuthSessionResource> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new RouteError(
        ErrorCodes.AUTH_TOKEN_EXPIRED,
        AuthMessages.INVALID_REFRESH,
      );
    }
    throw new RouteError(
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      AuthMessages.INVALID_REFRESH,
    );
  }

  const valid = await isRefreshTokenValid(payload.jti, payload.sub);
  if (!valid) {
    throw new RouteError(
      ErrorCodes.AUTH_TOKEN_REVOKED,
      AuthMessages.REVOKED_REFRESH,
    );
  }

  // Rotación: invalidar el refresh token anterior de inmediato
  await revokeRefreshToken(payload.jti);

  const user = await UserRepo.findById(payload.sub);
  if (!user) {
    throw new NotFoundError('El usuario no existe.');
  }
  if (!user.isActive) {
    throw new RouteError(
      ErrorCodes.AUTH_USER_INACTIVE,
      AuthMessages.USER_INACTIVE,
    );
  }

  return buildSession(user, false);
}

/** 6.1.5 Perfil propio */
function me(user: UserWithRole): UserResource {
  return toUserResource(user);
}

/** 6.1.6 Cambiar propia contraseña */
async function changePassword(
  user: UserWithRole,
  input: ChangePasswordRequest,
): Promise<void> {
  const isMatch = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!isMatch) {
    throw new RouteError(
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      AuthMessages.WRONG_CURRENT_PASSWORD,
    );
  }

  await UserRepo.update(user.id, {
    passwordHash: await hashPassword(input.newPassword),
  });
}

export default {
  register,
  login,
  logout,
  refresh,
  me,
  changePassword,
} as const;
