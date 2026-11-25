import { Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import { authenticate } from '#src/common/middleware/authenticate.ts';
import { sendSuccess } from '#src/common/utils/response.utils.ts';
import type { RoleName, UserWithRole } from '#src/entities/User/index.ts';
import DashboardService, {
  DashboardMessages,
} from '#src/services/DashboardService.ts';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const P = Paths.Dashboard;
const router = Router();

// Matriz 2.3: Dashboard L para cualquier rol autenticado
router.use(authenticate);

// 6.10.1 Obtener resumen del dashboard (adaptado al rol, caché 60 s)
router.get(P.Summary.PATH, async (_req, res) => {
  const user = res.locals.user as UserWithRole;
  const summary = await DashboardService.getSummary(
    user.id,
    user.role.name as RoleName,
  );
  sendSuccess(res, summary, DashboardMessages.SUMMARY);
});

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default router;
