import { Router } from 'express';

import HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';

import userRouter from './user.router.ts';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const apiRouter = Router();

// Endpoint de Salud / Healthcheck (Sección 1.6 y 6.9.3 del Contrato API)
// Ruta resultante: GET /api/v1/health
apiRouter.get('/health', (_req, res) => {
  return res.status(HttpStatusCodes.OK).json({
    success: true,
    message: "Servicio operativo.",
    data: {
      status: "ok",
      version: "1.2.0",
      timestamp: new Date().toISOString(),
      services: {
        database: "up",
        cache: "up",
        queue: "up"
      }
    }
  });
});

// Módulo de Usuarios -> Ruta resultante: /api/v1/users/...
apiRouter.use(Paths.Users.PATH, userRouter);

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default apiRouter;