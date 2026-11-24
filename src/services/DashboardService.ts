import logger from 'jet-logger';

import { Env, NodeEnvs } from '#src/common/constants/env.constants.ts';
import prisma from '#src/common/infra/prisma.ts';
import redis, { ensureRedisConnected } from '#src/common/infra/redis.ts';
import {
  type DashboardSummaryResource,
  materialListInclude,
  RECENT_MATERIALS_LIMIT,
  toMaterialListItem,
  visibleMaterialsWhere,
} from '#src/entities/Dashboard/index.ts';
import type { RoleName } from '#src/entities/User/index.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const DashboardMessages = {
  SUMMARY: 'Resumen del dashboard obtenido correctamente.',
} as const;

/** TTL del caché por usuario (contrato 6.10.1). */
export const DASHBOARD_CACHE_TTL_SECONDS = 60;

export const dashboardCacheKey = (userId: number) =>
  `dashboard:summary:${userId}`;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

function logError(message: string) {
  if (Env.NODE_ENV !== NodeEnvs.TEST) logger.err(message);
}

/**
 * Calcular las métricas según el rol (contrato 5.4.13):
 * - ADMIN: myAssignments y myMaterials son totales globales.
 * - DOCENTE: sus propias asignaciones y materiales.
 * - ESTUDIANTE: myAssignments y myMaterials en null.
 */
async function compute(
  userId: number,
  role: RoleName,
): Promise<DashboardSummaryResource> {
  const visible = visibleMaterialsWhere(role);
  const [
    currentPeriod,
    activeCareers,
    activeSubjects,
    visibleMaterials,
    myAssignments,
    myMaterials,
    recent,
  ] = await Promise.all([
    prisma.academicPeriod.findFirst({
      where: { isCurrent: true },
      select: { id: true, code: true, name: true },
      orderBy: { startDate: 'desc' },
    }),
    prisma.career.count({ where: { isActive: true } }),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.material.count({ where: visible }),
    role === 'ESTUDIANTE'
      ? Promise.resolve(null)
      : prisma.subjectAssignment.count({
          where: role === 'DOCENTE' ? { teacherId: userId } : {},
        }),
    role === 'ESTUDIANTE'
      ? Promise.resolve(null)
      : prisma.material.count({
          where:
            role === 'DOCENTE'
              ? { deletedAt: null, authorId: userId }
              : { deletedAt: null },
        }),
    prisma.material.findMany({
      where: visible,
      include: materialListInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_MATERIALS_LIMIT,
    }),
  ]);
  return {
    currentPeriod,
    counts: {
      activeCareers,
      activeSubjects,
      visibleMaterials,
      myAssignments,
      myMaterials,
    },
    recentMaterials: recent.map(toMaterialListItem),
  };
}

/**
 * 6.10.1 Resumen del dashboard, cacheado en Redis 60 s por usuario. Si Redis
 * falla, se calcula sin caché en vez de responder error.
 */
async function getSummary(
  userId: number,
  role: RoleName,
): Promise<DashboardSummaryResource> {
  const key = dashboardCacheKey(userId);
  try {
    await ensureRedisConnected();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as DashboardSummaryResource;
  } catch (err) {
    logError(`Dashboard: no se pudo leer el caché (${String(err)})`);
  }
  const summary = await DashboardService.compute(userId, role);
  try {
    await redis.set(key, JSON.stringify(summary), {
      EX: DASHBOARD_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    logError(`Dashboard: no se pudo guardar el caché (${String(err)})`);
  }
  return summary;
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

const DashboardService = { compute, getSummary };

export default DashboardService;
