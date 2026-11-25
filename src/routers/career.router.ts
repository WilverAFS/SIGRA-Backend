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
  type CareerListQuery,
  CareerListQuerySchema,
  type CreateCareerRequest,
  CreateCareerSchema,
  type UpdateCareerRequest,
  UpdateCareerSchema,
} from '#src/entities/Career/index.ts';
import CareerService, {
  CareerMessages,
} from '#src/services/CareerService.ts';

const P = Paths.Careers;
const router = Router();

router.use(authenticate);

// 6.4.1 Listar carreras (cualquier rol autenticado)
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ query: CareerListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as CareerListQuery;
    const page = await CareerService.list(query);
    sendPage(req, res, page, CareerMessages.LISTED);
  },
);

// 6.4.2 Crear carrera (solo ADMIN)
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN'),
  validate({ body: CreateCareerSchema }),
  async (req, res) => {
    const created = await CareerService.create(
      req.body as CreateCareerRequest,
    );
    sendCreated(res, created, CareerMessages.CREATED);
  },
);

// 6.4.3 Obtener carrera (cualquier rol autenticado)
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(res, await CareerService.getOne(id), CareerMessages.FOUND);
  },
);

// 6.4.4 Actualizar carrera (solo ADMIN)
router.patch(
  P.Update.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema, body: UpdateCareerSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const updated = await CareerService.update(
      id,
      req.body as UpdateCareerRequest,
    );
    sendSuccess(res, updated, CareerMessages.UPDATED);
  },
);

// 6.4.5 Eliminar carrera (solo ADMIN)
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await CareerService.remove(id);
    sendSuccess(res, null, CareerMessages.DELETED);
  },
);

export default router;
