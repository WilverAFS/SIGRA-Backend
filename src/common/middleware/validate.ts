import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

import {
  type ErrorDetail,
  RouteError,
  ValidationError,
} from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

interface Schemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Convertir los issues de zod en `error.details` (contrato 4.1).
 */
export function toDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'body',
    message: issue.message,
  }));
}

/**
 * Middleware de validación centralizada (contrato 5.2). Valida `params`,
 * `query` y `body`, en ese orden, y deja los valores ya convertidos en
 * `res.locals.params`, `res.locals.query` y `req.body`.
 *
 * Cuerpo ausente en un POST/PATCH que lo exige → 400; reglas de campo → 422.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const details: ErrorDetail[] = [];
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) res.locals.params = result.data;
      else details.push(...toDetails(result.error));
    }
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) res.locals.query = result.data;
      else details.push(...toDetails(result.error));
    }
    if (schemas.body) {
      const body: unknown = req.body;
      if (
        body === undefined ||
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        return next(
          new RouteError(
            ErrorCodes.BAD_REQUEST,
            'La petición requiere un cuerpo JSON.',
          ),
        );
      }
      const result = schemas.body.safeParse(body);
      if (result.success) req.body = result.data;
      else details.push(...toDetails(result.error));
    }
    if (details.length > 0) return next(new ValidationError(details));
    next();
  };
}
