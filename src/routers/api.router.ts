import { Router } from 'express';

import HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { sendSuccess } from '#src/common/utils/response.utils.ts';
import HealthService from '#src/services/HealthService.ts';

import authRouter from './auth.router.ts';
import careerRouter from './career.router.ts';
import instituteRouter from './institute.router.ts';
import auditRouter from './audit.router.ts';
import authRouter from './auth.router.ts';
import dashboardRouter from './dashboard.router.ts';
import roleRouter from './role.router.ts';
import userRouter from './user.router.ts';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const apiRouter = Router();

// 6.9.3 Verificar salud (público). Si una dependencia crítica está caída
// responde 503 con el mismo HealthResource en `data`, status `degraded` y
// `success` en false.
apiRouter.get(Paths.Health.PATH, async (_req, res) => {
  const health = await HealthService.getHealth();
  if (health.status === 'ok') {
    return sendSuccess(res, health, 'Servicio operativo.');
  }
  return res.status(HttpStatusCodes.SERVICE_UNAVAILABLE).json({
    success: false,
    message: 'Servicio degradado: una o más dependencias no responden.',
    data: health,
  });
});

// 6.2 Usuarios → /api/v1/users/...
apiRouter.use(Paths.Users.PATH, userRouter);

// 6.2 Roles → /api/v1/roles/...
apiRouter.use(Paths.Roles.PATH, roleRouter);
// 6.1 Autenticación → /api/v1/auth/...
apiRouter.use(Paths.Auth.PATH, authRouter);
// 6.3 Institutos → /api/v1/institutes/...
apiRouter.use(Paths.Institutes.PATH, instituteRouter);
// 6.4 Carreras → /api/v1/careers/...
apiRouter.use(Paths.Careers.PATH, careerRouter);

// 6.9 Auditoría → /api/v1/audit-logs/...
apiRouter.use(Paths.AuditLogs.PATH, auditRouter);

// 6.10 Dashboard → /api/v1/dashboard/...
apiRouter.use(Paths.Dashboard.PATH, dashboardRouter);

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default apiRouter;
