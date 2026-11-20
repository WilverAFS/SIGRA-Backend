import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const REQUEST_ID_HEADER = 'X-Request-Id';
const MAX_LENGTH = 128;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Propagar `X-Request-Id` (contrato 2.4): se reutiliza el del cliente si es
 * seguro y, si no viene, el backend genera uno.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id =
    incoming && incoming.length <= MAX_LENGTH && SAFE_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
