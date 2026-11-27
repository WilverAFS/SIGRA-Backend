import assert from 'node:assert/strict';
import type { Response } from 'supertest';

import type { ErrorCode } from '#src/common/constants/ErrorCodes.ts';
import prisma from '#src/common/infra/prisma.ts';
import type { ErrorEnvelope } from '#src/common/middleware/error-handler.ts';
import type {
  PaginatedEnvelope,
  SuccessEnvelope,
} from '#src/common/utils/response.utils.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

export type TypedRes<T> = Omit<Response, 'body'> & { body: T };
export type OkRes<T> = TypedRes<SuccessEnvelope<T>>;
export type PageRes<T> = TypedRes<PaginatedEnvelope<T>>;
export type ErrRes = TypedRes<ErrorEnvelope>;

// ========================================================================= //
//                                  HELPERS                                  //
// ========================================================================= //

/**
 * Comprobar que la respuesta es un error con la estructura del capítulo 4.
 */
export function assertError(
  res: Response,
  status: number,
  code: ErrorCode,
): ErrorEnvelope {
  const body = res.body as ErrorEnvelope;
  assert.equal(res.status, status);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.message, 'string');
  assert.ok(res.headers['x-request-id'], 'falta la cabecera X-Request-Id');
  return body;
}

/**
 * Campos con error en `error.details`.
 */
export function detailFields(body: ErrorEnvelope): string[] {
  return (body.error.details ?? []).map((detail) => detail.field);
}

/**
 * El middleware de auditoría escribe al terminar la respuesta, así que se
 * espera a que el evento asíncrono aparezca antes de comprobarlo.
 */
export async function auditLogsFor(action: string, expected = 1) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const logs = await prisma.auditLog.findMany({
      where: { action },
      orderBy: { id: 'asc' },
    });
    if (logs.length >= expected) return logs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return prisma.auditLog.findMany({
    where: { action },
    orderBy: { id: 'asc' },
  });
}
