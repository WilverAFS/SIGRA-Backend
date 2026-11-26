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
  type AcademicPeriodListQuery,
  AcademicPeriodListQuerySchema,
  type CreateAcademicPeriodRequest,
  CreateAcademicPeriodSchema,
  type UpdateAcademicPeriodRequest,
  UpdateAcademicPeriodSchema,
} from '#src/entities/AcademicPeriod/index.ts';
import AcademicPeriodService, {
  AcademicPeriodMessages,
} from '#src/services/AcademicPeriodService.ts';

const P = Paths.AcademicPeriods;
const router = Router();

router.use(authenticate);

// 6.5.1 Listar periodos (cualquier rol autenticado)
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ query: AcademicPeriodListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as AcademicPeriodListQuery;
    sendPage(
      req,
      res,
      await AcademicPeriodService.list(query),
      AcademicPeriodMessages.LISTED,
    );
  },
);

// 6.5.2 Crear periodo (solo ADMIN). Nace con isCurrent en false.
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN'),
  validate({ body: CreateAcademicPeriodSchema }),
  async (req, res) => {
    const created = await AcademicPeriodService.create(
      req.body as CreateAcademicPeriodRequest,
    );
    sendCreated(res, created, AcademicPeriodMessages.CREATED);
  },
);

// 6.5.3 Obtener el periodo vigente. Se registra ANTES de GET /:id.
router.get(
  P.Current.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  async (_req, res) => {
    sendSuccess(
      res,
      await AcademicPeriodService.getCurrent(),
      AcademicPeriodMessages.CURRENT_FOUND,
    );
  },
);

// 6.5.4 Obtener periodo (cualquier rol autenticado)
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(
      res,
      await AcademicPeriodService.getOne(id),
      AcademicPeriodMessages.FOUND,
    );
  },
);

// 6.5.6 Definir el periodo vigente (solo ADMIN), en transacción.
router.patch(
  P.SetCurrent.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    res.locals.audit = {
      action: 'ACADEMIC_PERIOD_SET_CURRENT',
      entityName: 'academic_periods',
    };
    sendSuccess(
      res,
      await AcademicPeriodService.setCurrent(id),
      AcademicPeriodMessages.SET_CURRENT,
    );
  },
);

// 6.5.5 Actualizar periodo (solo ADMIN). No acepta isCurrent.
router.patch(
  P.Update.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema, body: UpdateAcademicPeriodSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const updated = await AcademicPeriodService.update(
      id,
      req.body as UpdateAcademicPeriodRequest,
    );
    sendSuccess(res, updated, AcademicPeriodMessages.UPDATED);
  },
);

// 6.5.7 Eliminar periodo (solo ADMIN)
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await AcademicPeriodService.remove(id);
    sendSuccess(res, null, AcademicPeriodMessages.DELETED);
  },
);

export default router;
