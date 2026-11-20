import { Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import { validate } from '#src/common/middleware/validate.ts';
import {
  sendCreated,
  sendPage,
  sendSuccess,
} from '#src/common/utils/response.utils.ts';
import { type IdParams, IdParamsSchema } from '#src/common/validation/rules.ts';
import {
  type CreateUserRequest,
  CreateUserSchema,
  type UpdateUserRequest,
  UpdateUserSchema,
  type UserListQuery,
  UserListQuerySchema,
} from '#src/entities/User/index.ts';
import UserService, { UserMessages } from '#src/services/UserService.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const P = Paths.Users;

// TODO(BE #5): proteger todas estas rutas con autenticación y rol ADMIN
// (contrato 2.3: Usuarios L/E solo para ADMIN).

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const router = Router();

// 6.2.1 Listar usuarios
router.get(
  P.Get.PATH,
  validate({ query: UserListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as UserListQuery;
    const page = await UserService.list(query);
    sendPage(req, res, page, UserMessages.LISTED);
  },
);

// 6.2.2 Crear usuario
router.post(
  P.Add.PATH,
  validate({ body: CreateUserSchema }),
  async (req, res) => {
    const user = await UserService.create(req.body as CreateUserRequest);
    sendCreated(res, user, UserMessages.CREATED);
  },
);

// 6.2.3 Obtener usuario
router.get(
  P.GetOne.PATH,
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(res, await UserService.getOne(id), UserMessages.FOUND);
  },
);

// 6.2.4 Actualizar usuario (PATCH, actualización parcial)
router.patch(
  P.Update.PATH,
  validate({ params: IdParamsSchema, body: UpdateUserSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const user = await UserService.update(id, req.body as UpdateUserRequest);
    sendSuccess(res, user, UserMessages.UPDATED);
  },
);

// 6.2.5 Eliminar usuario (baja lógica)
router.delete(
  P.Delete.PATH,
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await UserService.remove(id);
    sendSuccess(res, null, UserMessages.DELETED);
  },
);

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default router;
