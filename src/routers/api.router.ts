import { Router } from 'express';

import HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { sendSuccess } from '#src/common/utils/response.utils.ts';
import HealthService from '#src/services/HealthService.ts';

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

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default apiRouter;
