import { type Response, Router } from 'express';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import uploadSingleFile, { streamUpload } from '#src/common/infra/upload.ts';
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
  type CreateMaterialRequest,
  CreateMaterialSchema,
  type MaterialListQuery,
  MaterialListQuerySchema,
  type UpdateMaterialRequest,
  UpdateMaterialSchema,
} from '#src/entities/Material/index.ts';
import {
  type CreateMaterialVersionRequest,
  CreateMaterialVersionSchema,
  type MaterialVersionListQuery,
  MaterialVersionListQuerySchema,
  type VersionParams,
  VersionParamsSchema,
} from '#src/entities/MaterialVersion/index.ts';
import type { RoleName, UserWithRole } from '#src/entities/User/index.ts';
import MaterialService, {
  MaterialMessages,
} from '#src/services/MaterialService.ts';

const P = Paths.Materials;
const router = Router();

router.use(authenticate);

/** Alcance del usuario del token; ADMIN está exento de propiedad y asignación. */
function viewer(res: Response): { id: number; role: RoleName } {
  const user = res.locals.user as UserWithRole;
  return { id: user.id, role: user.role.name as RoleName };
}

function requireFile(res: Response): Express.Multer.File {
  if (!res.req.file) {
    throw new RouteError(
      ErrorCodes.BAD_REQUEST,
      MaterialMessages.FILE_REQUIRED,
    );
  }
  return res.req.file;
}

// 6.8.1 Listar y buscar materiales (cualquier rol autenticado)
router.get(
  P.Get.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ query: MaterialListQuerySchema }),
  async (req, res) => {
    const query = res.locals.query as MaterialListQuery;
    sendPage(
      req,
      res,
      await MaterialService.list(query, viewer(res)),
      MaterialMessages.LISTED,
    );
  },
);

// 6.8.2 Crear material con su versión 1 (DOCENTE o ADMIN, multipart)
router.post(
  P.Add.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  uploadSingleFile,
  validate({ body: CreateMaterialSchema }),
  async (_req, res) => {
    const created = await MaterialService.create(
      _req.body as CreateMaterialRequest,
      requireFile(res),
      viewer(res),
    );
    res.locals.audit = {
      action: 'MATERIAL_UPLOADED',
      entityName: 'materials',
      entityId: created.id,
      metadata: {
        materialType: created.materialType,
        versionNumber: created.currentVersion,
      },
    };
    sendCreated(res, created, MaterialMessages.CREATED);
  },
);

// 6.8.6 Descargar la versión vigente (binario)
router.get(
  P.Download.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    streamUpload(res, await MaterialService.prepareDownload(id, viewer(res)));
  },
);

// 6.8.10 Descargar una versión concreta (solo DOCENTE o ADMIN)
router.get(
  P.DownloadVersion.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: VersionParamsSchema }),
  async (_req, res) => {
    const { id, versionNumber } = res.locals.params as VersionParams;
    streamUpload(
      res,
      await MaterialService.prepareDownload(id, viewer(res), versionNumber),
    );
  },
);

// 6.8.9 Obtener metadatos de una versión concreta
router.get(
  P.GetVersion.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: VersionParamsSchema }),
  async (_req, res) => {
    const { id, versionNumber } = res.locals.params as VersionParams;
    sendSuccess(
      res,
      await MaterialService.getVersion(id, versionNumber, viewer(res)),
      MaterialMessages.VERSION_FOUND,
    );
  },
);

// 6.8.7 Historial de versiones, de la más reciente a la más antigua
router.get(
  P.Versions.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: IdParamsSchema, query: MaterialVersionListQuerySchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const query = res.locals.query as MaterialVersionListQuery;
    sendPage(
      req,
      res,
      await MaterialService.listVersions(id, query, viewer(res)),
      MaterialMessages.VERSIONS_LISTED,
    );
  },
);

// 6.8.8 Subir una versión nueva (autor o ADMIN, multipart)
router.post(
  P.AddVersion.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  uploadSingleFile,
  validate({ params: IdParamsSchema, body: CreateMaterialVersionSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    const result = await MaterialService.addVersion(
      id,
      req.body as CreateMaterialVersionRequest,
      requireFile(res),
      viewer(res),
    );
    res.locals.audit = {
      action:
        result.materialType === 'PLANEACION'
          ? 'PLANEACION_VERSIONED'
          : 'MATERIAL_VERSIONED',
      entityName: 'materials',
      entityId: id,
      metadata: {
        materialType: result.materialType,
        versionNumber: result.version.versionNumber,
      },
    };
    sendCreated(res, result.version, MaterialMessages.VERSION_CREATED);
  },
);

// 6.8.3 Obtener material con el detalle de su versión vigente
router.get(
  P.GetOne.PATH,
  authorizeRoles('ADMIN', 'DOCENTE', 'ESTUDIANTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(
      res,
      await MaterialService.getOne(id, viewer(res)),
      MaterialMessages.FOUND,
    );
  },
);

// 6.8.4 Editar datos del material (nunca el archivo)
router.patch(
  P.Update.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: IdParamsSchema, body: UpdateMaterialSchema }),
  async (req, res) => {
    const { id } = res.locals.params as IdParams;
    sendSuccess(
      res,
      await MaterialService.update(
        id,
        req.body as UpdateMaterialRequest,
        viewer(res),
      ),
      MaterialMessages.UPDATED,
    );
  },
);

// 6.8.5 Eliminar material (baja lógica)
router.delete(
  P.Delete.PATH,
  authorizeRoles('ADMIN', 'DOCENTE'),
  validate({ params: IdParamsSchema }),
  async (_req, res) => {
    const { id } = res.locals.params as IdParams;
    await MaterialService.remove(id, viewer(res));
    sendSuccess(res, null, MaterialMessages.DELETED);
  },
);

export default router;
