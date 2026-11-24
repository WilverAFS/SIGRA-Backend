import { Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import { authenticate } from '#src/common/middleware/authenticate.ts';
import { authorizeRoles } from '#src/common/middleware/authorize.ts';
import { validate } from '#src/common/middleware/validate.ts';
import { sendPage, sendSuccess } from '#src/common/utils/response.utils.ts';
import {
  type AuditLogIdParams,
  AuditLogIdParamsSchema,
  type AuditLogListQuery,
  AuditLogListQuerySchema,
} from '#src/entities/AuditLog/index.ts';
import AuditService, { AuditMessages } from '#src/services/AuditService.ts';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const P = Paths.AuditLogs;
const router = Router();

// Matriz 2.3: Auditoría L solo para ADMIN
router.use(authenticate, authorizeRoles('ADMIN'));

// 6.9.1 Listar eventos de auditoría (más recientes primero)
router.get(
  P.Get.PATH,
  validate({ query: AuditLogListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as AuditLogListQuery;
    const page = await AuditService.list(query);
    sendPage(req, res, page, AuditMessages.LISTED);
  },
);

// 6.9.2 Obtener evento de auditoría
router.get(
  P.GetOne.PATH,
  validate({ params: AuditLogIdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as AuditLogIdParams;
    sendSuccess(res, await AuditService.getOne(id), AuditMessages.FOUND);
  },
);

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default router;
