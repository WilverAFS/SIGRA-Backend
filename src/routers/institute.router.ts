import { Router } from 'express';

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
  type CreateInstituteRequest,
  CreateInstituteSchema,
  type InstituteListQuery,
  InstituteListQuerySchema,
  type UpdateInstituteRequest,
  UpdateInstituteSchema,
} from '#src/entities/Institute/index.ts';
import InstituteService, {
  InstituteMessages,
} from '#src/services/InstituteService.ts';

const P = Paths.Institutes;
const router = Router();

router.use(authenticate);

// 6.3.1 Listar institutos (cualquier rol autenticado)
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ query: InstituteListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as InstituteListQuery;
    const page = await InstituteService.list(query);
    sendPage(req, res, page, InstituteMessages.LISTED);
  },
);

// 6.3.2 Crear instituto (solo ADMIN)
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN'),
  validate({ body: CreateInstituteSchema }),
  async (req, res) => {
    const created = await InstituteService.create(
      req.body as CreateInstituteRequest,
    );
    sendCreated(res, created, InstituteMessages.CREATED);
  },
);

// 6.3.3 Obtener instituto (cualquier rol autenticado)
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(res, await InstituteService.getOne(id), InstituteMessages.FOUND);
  },
);

// 6.3.4 Actualizar instituto (solo ADMIN)
router.patch(
  P.Update.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema, body: UpdateInstituteSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const updated = await InstituteService.update(
      id,
      req.body as UpdateInstituteRequest,
    );
    sendSuccess(res, updated, InstituteMessages.UPDATED);
  },
);

// 6.3.5 Eliminar instituto (solo ADMIN)
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await InstituteService.remove(id);
    sendSuccess(res, null, InstituteMessages.DELETED);
  },
);

export default router;
