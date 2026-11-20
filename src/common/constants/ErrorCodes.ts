import HttpStatusCodes from './HttpStatusCodes.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

/**
 * Códigos de error de negocio (ContratoAPI-SIGRA, catálogo 4.3).
 *
 * `error.code` es el identificador estable que usa el frontend; nunca se
 * programa lógica contra el texto de `message`.
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  AUTH_USER_INACTIVE: 'AUTH_USER_INACTIVE',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  FORBIDDEN_OWNERSHIP: 'FORBIDDEN_OWNERSHIP',
  FORBIDDEN_SUBJECT_ASSIGNMENT: 'FORBIDDEN_SUBJECT_ASSIGNMENT',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT_UNIQUE: 'CONFLICT_UNIQUE',
  PERIOD_ALREADY_CURRENT: 'PERIOD_ALREADY_CURRENT',
  ASSIGNMENT_DUPLICATED: 'ASSIGNMENT_DUPLICATED',
  RESOURCE_HAS_DEPENDENCIES: 'RESOURCE_HAS_DEPENDENCIES',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Fuera del catálogo 4.3: el contrato define el 400 y el 413 de forma
  // (4.2) pero no les asigna código de negocio. Pendiente de agregar al Doc.
  BAD_REQUEST: 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Estado HTTP de cada código de negocio (catálogo 4.3). */
export const ErrorCodeStatus: Record<ErrorCode, HttpStatusCodes> = {
  VALIDATION_ERROR: HttpStatusCodes.UNPROCESSABLE_ENTITY,
  AUTH_INVALID_CREDENTIALS: HttpStatusCodes.UNAUTHORIZED,
  AUTH_TOKEN_EXPIRED: HttpStatusCodes.UNAUTHORIZED,
  AUTH_TOKEN_REVOKED: HttpStatusCodes.UNAUTHORIZED,
  AUTH_USER_INACTIVE: HttpStatusCodes.FORBIDDEN,
  FORBIDDEN_ROLE: HttpStatusCodes.FORBIDDEN,
  FORBIDDEN_OWNERSHIP: HttpStatusCodes.FORBIDDEN,
  FORBIDDEN_SUBJECT_ASSIGNMENT: HttpStatusCodes.FORBIDDEN,
  RESOURCE_NOT_FOUND: HttpStatusCodes.NOT_FOUND,
  CONFLICT_UNIQUE: HttpStatusCodes.CONFLICT,
  PERIOD_ALREADY_CURRENT: HttpStatusCodes.CONFLICT,
  ASSIGNMENT_DUPLICATED: HttpStatusCodes.CONFLICT,
  RESOURCE_HAS_DEPENDENCIES: HttpStatusCodes.CONFLICT,
  FILE_TOO_LARGE: HttpStatusCodes.PAYLOAD_TOO_LARGE,
  FILE_TYPE_NOT_ALLOWED: HttpStatusCodes.UNSUPPORTED_MEDIA_TYPE,
  VERSION_NOT_FOUND: HttpStatusCodes.NOT_FOUND,
  RATE_LIMIT_EXCEEDED: HttpStatusCodes.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: HttpStatusCodes.INTERNAL_SERVER_ERROR,
  BAD_REQUEST: HttpStatusCodes.BAD_REQUEST,
  PAYLOAD_TOO_LARGE: HttpStatusCodes.PAYLOAD_TOO_LARGE,
};
