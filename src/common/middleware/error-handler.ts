import type { NextFunction, Request, Response } from 'express';
import logger from 'jet-logger';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { Env, NodeEnvs } from '#src/common/constants/env.constants.ts';
import {
  type ErrorCode,
  ErrorCodes,
  ErrorCodeStatus,
} from '#src/common/constants/ErrorCodes.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/** Estructura estándar de error (contrato 4.1). */
export interface ErrorEnvelope {
  success: false;
  message: string;
  data: null;
  error: {
    code: ErrorCode;
    details?: { field: string; message: string }[];
  };
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  details?: ErrorEnvelope['error']['details'],
  status = ErrorCodeStatus[code],
) {
  const body: ErrorEnvelope = {
    success: false,
    message,
    data: null,
    error: details ? { code, details } : { code },
  };
  return res.status(status).json(body);
}

/**
 * Rutas inexistentes: 404 con la estructura estándar.
 */
export function notFoundHandler(_req: Request, res: Response) {
  return sendError(
    res,
    ErrorCodes.RESOURCE_NOT_FOUND,
    'La ruta solicitada no existe.',
  );
}

/**
 * Manejador global. `_next` debe quedarse: Express solo trata como manejador
 * de errores al middleware de 4 argumentos.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof RouteError) {
    return sendError(res, err.code, err.message, err.details, err.status);
  }
  // Errores de body-parser: son del cliente; no se expone el cuerpo recibido.
  if ('type' in err) {
    if (err.type === 'entity.parse.failed') {
      return sendError(
        res,
        ErrorCodes.BAD_REQUEST,
        'El cuerpo de la petición no es un JSON válido.',
      );
    }
    if (err.type === 'entity.too.large') {
      return sendError(
        res,
        ErrorCodes.PAYLOAD_TOO_LARGE,
        'El cuerpo de la petición es demasiado grande.',
      );
    }
  }
  if (Env.NODE_ENV !== NodeEnvs.TEST) {
    logger.err(`[${String(res.locals.requestId)}] ${err.stack ?? err.message}`);
  }
  return sendError(
    res,
    ErrorCodes.INTERNAL_ERROR,
    'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
  );
}
