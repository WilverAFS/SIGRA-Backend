import type { AuditLog, Prisma } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import { idParam, Messages } from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

/**
 * Acciones de auditoría (contrato 5.1.10 y 6.9). Cada módulo agrega aquí las
 * suyas (p. ej. altas y bajas de catálogos) y llama a `AuditService.record`.
 */
export const AuditActions = {
  USER_CREATED: 'USER_CREATED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  MATERIAL_UPLOADED: 'MATERIAL_UPLOADED',
  PLANEACION_VERSIONED: 'PLANEACION_VERSIONED',
} as const;
export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/** Llaves que nunca se guardan en `metadata` (contrato 5.4.11). */
const FORBIDDEN_METADATA_KEY =
  /pass(word)?|hash|token|secret|authorization|cookie|content|file(data|content)/i;

const MAX_ID = 2147483647;

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/** Evento de dominio que viaja por RabbitMQ hacia la bitácora. */
export interface AuditEvent {
  userId: number | null;
  action: string;
  entityName: string;
  entityId: number | null;
  metadata: Record<string, unknown> | null;
  /** Momento en que ocurrió la acción (no cuando se persistió). */
  occurredAt: string;
}

/** Quién ejecuta la acción y desde dónde. */
export interface AuditContext {
  userId: number | null;
  ip?: string;
}

/** Contexto para eventos del sistema (sin usuario). */
export const SYSTEM_CONTEXT: AuditContext = { userId: null };

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

const isoDate = (field: string) =>
  z
    .string()
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value) &&
        !Number.isNaN(Date.parse(value)),
      `${field} debe ser una fecha ISO 8601 (p. ej. 2026-11-27 o 2026-11-27T15:04:05Z).`,
    )
    .transform((value) => new Date(value));

const shortText = (field: string) =>
  z
    .string()
    .trim()
    .min(1, Messages.REQUIRED)
    .max(60, `${field} debe tener como máximo 60 caracteres.`);

/**
 * Filtros de GET /audit-logs (6.9.1). El orden es fijo (más recientes
 * primero), así que `sort` no aplica y se ignora.
 */
export const AuditLogListQuerySchema = listQuery({
  sortable: ['createdAt'],
  defaultSort: 'createdAt:desc',
})
  .omit({ sort: true })
  .extend({
    userId: idParam().optional(),
    action: shortText('action').optional(),
    entityName: shortText('entityName').optional(),
    entityId: idParam().optional(),
    from: isoDate('from').optional(),
    to: isoDate('to').optional(),
  })
  .superRefine((query, ctx) => {
    if (query.from && query.to && query.from > query.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to debe ser igual o posterior a from.',
      });
    }
  });
export type AuditLogListQuery = z.infer<typeof AuditLogListQuerySchema>;

/** `{ id }` de un evento: BIGINT en la BD, entero seguro en JSON. */
export const AuditLogIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9][0-9]*$/, Messages.POSITIVE_INTEGER)
    // Zod sigue evaluando aunque falle la regex: validar antes de BigInt()
    .refine(
      (value) =>
        /^[1-9][0-9]*$/.test(value) &&
        BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER),
      Messages.POSITIVE_INTEGER,
    )
    .transform((value) => BigInt(value)),
});
export type AuditLogIdParams = z.infer<typeof AuditLogIdParamsSchema>;

/** Validación del mensaje que llega de la cola (puede venir corrupto). */
export const AuditEventSchema = z.object({
  userId: z.number().int().positive().max(MAX_ID).nullable(),
  action: z.string().min(1).max(60),
  entityName: z.string().min(1).max(60),
  entityId: z.number().int().positive().max(MAX_ID).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  occurredAt: z.iso.datetime(),
});

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** AuditLogResource (contrato 5.4.11). */
export interface AuditLogResource {
  id: number;
  userId: number | null;
  action: string;
  entityName: string;
  entityId: number | null;
  metadata: Prisma.JsonValue;
  createdAt: string;
}

export function toAuditLogResource(log: AuditLog): AuditLogResource {
  return {
    id: Number(log.id),
    userId: log.userId,
    action: log.action,
    entityName: log.entityName,
    entityId: log.entityId,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Quitar de `metadata` cualquier llave sensible (contraseñas, hashes,
 * tokens, contenidos de archivo), también en objetos anidados.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !FORBIDDEN_METADATA_KEY.test(key))
          .map(([key, inner]) => [key, clean(inner)]),
      );
    }
    return value;
  };
  return clean(metadata) as Record<string, unknown>;
}
