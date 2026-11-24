import type { AuditLog, Prisma } from '@prisma/client';

import prisma from '#src/common/infra/prisma.ts';
import { toSkipTake } from '#src/common/validation/list-query.ts';
import type {
  AuditEvent,
  AuditLogListQuery,
} from '#src/entities/AuditLog/index.ts';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/** 6.9.1: filtros y orden fijo, más recientes primero. */
async function findMany(
  query: AuditLogListQuery,
): Promise<{ items: AuditLog[]; total: number }> {
  const where: Prisma.AuditLogWhereInput = {
    userId: query.userId,
    action: query.action,
    entityName: query.entityName,
    entityId: query.entityId,
    createdAt:
      query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

function findById(id: bigint): Promise<AuditLog | null> {
  return prisma.auditLog.findUnique({ where: { id } });
}

/**
 * Persistir un evento. Si el usuario ya no existe (FK), se guarda con
 * `userId` en null, como permite el contrato.
 */
async function create(event: AuditEvent): Promise<AuditLog> {
  const data = {
    action: event.action,
    entityName: event.entityName,
    entityId: event.entityId,
    metadata: (event.metadata ?? undefined) as
      Prisma.InputJsonValue | undefined,
    createdAt: new Date(event.occurredAt),
  };
  if (event.userId !== null) {
    const exists = await prisma.user.count({ where: { id: event.userId } });
    if (exists > 0) {
      return prisma.auditLog.create({
        data: { ...data, userId: event.userId },
      });
    }
  }
  return prisma.auditLog.create({ data });
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default { findMany, findById, create } as const;
