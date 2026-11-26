import { type Response, Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import { authenticate } from '#src/common/middleware/authenticate.ts';
import { authorizeRoles } from '#src/common/middleware/authorize.ts';
import { validate } from '#src/common/middleware/validate.ts';
import {
  sendCreated,
  sendPage,
  sendSuccess,
} from '#src/common/utils/response.utils.ts';
import { type IdParams, IdParamsSchema } from '#src/common/validation/rules.ts';
import {
  type CreateSubjectAssignmentRequest,
  CreateSubjectAssignmentSchema,
  type SubjectAssignmentListQuery,
  SubjectAssignmentListQuerySchema,
} from '#src/entities/SubjectAssignment/index.ts';
import type { RoleName, UserWithRole } from '#src/entities/User/index.ts';
import SubjectAssignmentService, {
  SubjectAssignmentMessages,
} from '#src/services/SubjectAssignmentService.ts';

const P = Paths.SubjectAssignments;
const router = Router();

router.use(authenticate);

/** Alcance del usuario del token; el DOCENTE está limitado a sus asignaciones. */
function viewer(res: Response): { id: number; role: RoleName } {
  const user = res.locals.user as UserWithRole;
  return { id: user.id, role: user.role.name as RoleName };
}

// 6.7.1 Listar asignaciones: ADMIN todas, DOCENTE solo las propias
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ query: SubjectAssignmentListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as SubjectAssignmentListQuery;
    sendPage(
      req,
      res,
      await SubjectAssignmentService.list(query, viewer(res)),
      SubjectAssignmentMessages.LISTED,
    );
  },
);

// 6.7.2 Crear asignación (solo ADMIN); assignedBy sale del token
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN'),
  validate({ body: CreateSubjectAssignmentSchema }),
  async (req, res) => {
    const created = await SubjectAssignmentService.create(
      req.body as CreateSubjectAssignmentRequest,
      viewer(res).id,
    );
    sendCreated(res, created, SubjectAssignmentMessages.CREATED);
  },
);

// 6.7.3 Obtener asignación: ADMIN, o DOCENTE si es suya
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(
      res,
      await SubjectAssignmentService.getOne(id, viewer(res)),
      SubjectAssignmentMessages.FOUND,
    );
  },
);

// 6.7.4 Eliminar asignación (solo ADMIN), borrado físico
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await SubjectAssignmentService.remove(id);
    sendSuccess(res, null, SubjectAssignmentMessages.DELETED);
  },
);

export default router;
