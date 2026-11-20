import {
  type ErrorCode,
  ErrorCodes,
  ErrorCodeStatus,
} from '#src/common/constants/ErrorCodes.ts';
import type HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/** Detalle por campo de un error de validación (contrato 4.1). */
export interface ErrorDetail {
  field: string;
  message: string;
}

// ========================================================================= //
//                                  CLASSES                                  //
// ========================================================================= //

/**
 * Error de la API con código de negocio (catálogo 4.3). El manejador global
 * lo convierte en la estructura estándar de error del capítulo 4.
 */
export class RouteError extends Error {
  public status: HttpStatusCodes;
  public code: ErrorCode;
  public details?: ErrorDetail[];

  public constructor(
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[],
    status: HttpStatusCodes = ErrorCodeStatus[code],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 422 VALIDATION_ERROR con el detalle por campo. */
export class ValidationError extends RouteError {
  public constructor(
    details: ErrorDetail[],
    message = 'Los datos enviados no son válidos.',
  ) {
    super(ErrorCodes.VALIDATION_ERROR, message, details);
  }
}

/** 404 RESOURCE_NOT_FOUND. */
export class NotFoundError extends RouteError {
  public constructor(message = 'El recurso solicitado no existe.') {
    super(ErrorCodes.RESOURCE_NOT_FOUND, message);
  }
}

/** 409 CONFLICT_UNIQUE, señalando el campo duplicado. */
export class ConflictUniqueError extends RouteError {
  public constructor(field: string, message: string) {
    super(ErrorCodes.CONFLICT_UNIQUE, message, [{ field, message }]);
  }
}
