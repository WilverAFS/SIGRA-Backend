import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { Env, NodeEnvs } from '#src/common/constants/env.constants.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { auditTrail } from '#src/common/middleware/audit-trail.ts';
import {
  errorHandler,
  notFoundHandler,
} from '#src/common/middleware/error-handler.ts';
import {
  REQUEST_ID_HEADER,
  requestId,
} from '#src/common/middleware/request-id.ts';
import openApiDocument from '#src/docs/openapi.ts';
import BaseRouter from '#src/routers/api.router.ts';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const app = express();
const isProduction = Env.NODE_ENV === NodeEnvs.PRODUCTION;

// =============================== Middleware ============================== //

// X-Request-Id en toda petición y respuesta (contrato 2.4)
app.use(requestId);

// Cabeceras de seguridad (contrato 2.4): nosniff y DENY siempre; HSTS solo
// en producción. La CSP se relaja en /docs para que cargue Swagger UI.
app.use(
  helmet({
    frameguard: { action: 'deny' },
    strictTransportSecurity: isProduction,
    contentSecurityPolicy: false,
  }),
);

// CORS: solo los orígenes del frontend configurados en CORS_ORIGIN
app.use(
  cors({
    origin: Env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mostrar las rutas llamadas en consola durante el desarrollo
if (Env.NODE_ENV === NodeEnvs.DEVELOPMENT) {
  app.use(morgan('dev'));
}

// =========================== Documentación (Swagger) ===================== //

app.get(Paths.Docs.JSON, (_req, res) => {
  res.json(openApiDocument);
});
app.use(
  Paths.Docs.FULL_PATH,
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, { customSiteTitle: 'SIGRA API v1' }),
);

// ================================== API ================================== //

// Bitácora de auditoría de las mutaciones exitosas (contrato 6.9)
app.use(auditTrail);

app.use(Paths.PATH, BaseRouter);

// Rutas inexistentes y manejador global de errores (contrato cap. 4)
app.use(notFoundHandler);
app.use(errorHandler);

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default app;
