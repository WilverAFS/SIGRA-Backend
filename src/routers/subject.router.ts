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
  type CreateSubjectRequest,
  CreateSubjectSchema,
  type SubjectListQuery,
  SubjectListQuerySchema,
  type UpdateSubjectRequest,
  UpdateSubjectSchema,
} from '#src/entities/Subject/index.ts';
import SubjectService, {
  SubjectMessages,
} from '#src/services/SubjectService.ts';

const P = Paths.Subjects;
const router = Router();

router.use(authenticate);

// 6.6.1 Listar materias (cualquier rol autenticado)
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ query: SubjectListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as SubjectListQuery;
    sendPage(
      req,
      res,
      await SubjectService.list(query),
      SubjectMessages.LISTED,
    );
  },
);

// 6.6.2 Crear materia (solo ADMIN)
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN'),
  validate({ body: CreateSubjectSchema }),
  async (req, res) => {
    const created = await SubjectService.create(
      req.body as CreateSubjectRequest,
    );
    sendCreated(res, created, SubjectMessages.CREATED);
  },
);

// 6.6.3 Obtener materia (cualquier rol autenticado)
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(res, await SubjectService.getOne(id), SubjectMessages.FOUND);
  },
);

// 6.6.4 Actualizar materia (solo ADMIN)
router.patch(
  P.Update.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema, body: UpdateSubjectSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const updated = await SubjectService.update(
      id,
      req.body as UpdateSubjectRequest,
    );
    sendSuccess(res, updated, SubjectMessages.UPDATED);
  },
);

// 6.6.5 Eliminar materia (solo ADMIN)
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await SubjectService.remove(id);
    sendSuccess(res, null, SubjectMessages.DELETED);
  },
);

export default router;
