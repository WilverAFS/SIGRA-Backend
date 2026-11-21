import { Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import { authenticate } from '#src/common/middleware/authenticate.ts';
import { authorizeRoles } from '#src/common/middleware/authorize.ts';
import { validate } from '#src/common/middleware/validate.ts';
import { type IdParams, IdParamsSchema } from '#src/entities/Role/index.ts';
import RoleService, { RoleMessages } from '#src/services/RoleService.ts';
import { sendSuccess } from '#src/common/utils/response.utils.ts';

const P = Paths.Roles;
const router = Router();

// Matriz 2.3: Roles L para ADMIN, DOCENTE y ESTUDIANTE
router.use(authenticate, authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'));

// 6.2.6 Listar roles
router.get(P.Get.PATH, async (_req, res) => {
  const roles = await RoleService.list();
  sendSuccess(res, roles, RoleMessages.LISTED);
});

// 6.2.7 Obtener rol
router.get(
  P.GetOne.PATH,
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    const role = await RoleService.getOne(id);
    sendSuccess(res, role, RoleMessages.FOUND);
  },
);

export default router;
