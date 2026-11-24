import type { NextFunction, Request, Response } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import AuditService from '#src/services/AuditService.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/**
 * Ajustes opcionales que una ruta deja en `res.locals.audit` antes de
 * responder, para cambiar lo que el middleware registra por defecto.
 */
export interface AuditOverride {
  /** No registrar esta petición. */
  skip?: boolean;
  action?: string;
  entityName?: string;
  entityId?: number | null;
  /** Actor (p. ej. el propio usuario en el autorregistro). */
  userId?: number | null;
  /** Datos extra; nunca contraseñas, tokens ni contenidos (5.4.11). */
  metadata?: Record<string, unknown>;
}

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const MUTATIONS: Record<string, string> = {
  POST: 'CREATED',
  PUT: 'UPDATED',
  PATCH: 'UPDATED',
  DELETE: 'DELETED',
};

/**
 * Prefijos que no son mutaciones de una entidad (sesiones, tokens). Si una
 * de estas rutas quiere auditar algo, lo pide con `res.locals.audit`.
 */
const EXCLUDED_PREFIXES = [`${Paths.PATH}${Paths.Auth.PATH}`];

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Entidad a partir de la ruta: `/api/v1/academic-periods/3` →
 * `academic_periods` y acción base `ACADEMIC_PERIOD`.
 */
export function entityFromPath(path: string): {
  entityName: string;
  actionPrefix: string;
} | null {
  const [segment] = path.slice(Paths.PATH.length).split('/').filter(Boolean);
  if (!segment) return null;
  const entityName = segment.replace(/-/g, '_').toLowerCase();
  const singular = entityName.endsWith('s')
    ? entityName.slice(0, -1)
    : entityName;
  return { entityName, actionPrefix: singular.toUpperCase() };
}

function toId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Middleware de bitácora (contrato 6.9). Registra cada mutación exitosa
 * (POST, PUT, PATCH o DELETE con respuesta 2xx) bajo /api/v1:
 *
 * - action: `<ENTIDAD>_CREATED | _UPDATED | _DELETED` (p. ej. USER_CREATED).
 * - entityName: el recurso de la ruta (p. ej. users, academic_periods).
 * - entityId: el `data.id` de la respuesta o el `:id` de la ruta.
 * - userId: el usuario autenticado.
 * - metadata: método, ruta, IP y, en PATCH/PUT, los NOMBRES de los campos
 *   modificados (nunca sus valores).
 *
 * El evento se publica en RabbitMQ al terminar la respuesta, así que no
 * retrasa al usuario ni puede hacer fallar la operación.
 */
export function auditTrail(req: Request, res: Response, next: NextFunction) {
  const verb = MUTATIONS[req.method];
  if (!verb || !req.originalUrl.startsWith(Paths.PATH)) return next();

  // Guardar el cuerpo de la respuesta para leer el id del recurso creado
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const override = res.locals.audit as AuditOverride | undefined;
    if (override?.skip || res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }
    const path = req.originalUrl.split('?')[0];
    if (!override && EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) {
      return;
    }
    const entity = entityFromPath(path);
    if (!entity && !override?.action) return;

    const body = res.locals.responseBody as
      { data?: { id?: unknown } | null } | undefined;
    const params = res.locals.params as { id?: unknown } | undefined;
    const user = res.locals.user as { id: number } | undefined;
    const changedFields =
      verb === 'UPDATED' && req.body && typeof req.body === 'object'
        ? Object.keys(req.body as object)
        : undefined;

    AuditService.recordInBackground(
      {
        userId:
          override?.userId !== undefined ? override.userId : (user?.id ?? null),
        ip: req.ip,
      },
      override?.action ?? `${entity!.actionPrefix}_${verb}`,
      override?.entityName ?? entity!.entityName,
      override?.entityId !== undefined
        ? override.entityId
        : (toId(body?.data?.id) ?? toId(params?.id ?? req.params.id)),
      {
        method: req.method,
        path,
        ...(changedFields ? { changedFields } : {}),
        ...override?.metadata,
      },
    );
  });
  next();
}
