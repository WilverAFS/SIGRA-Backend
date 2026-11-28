import { API_VERSION } from '#src/services/HealthService.ts';

// ========================================================================= //
//                                 HELPERS                                   //
// ========================================================================= //

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Envoltura `{ success, message, data }` con un Resource en `data`. */
const envelope = (data: object) => ({
  allOf: [ref('SuccessEnvelope'), { type: 'object', properties: { data } }],
});

const json = (schema: object) => ({
  content: { 'application/json': { schema } },
});

/** Respuesta de error con la estructura del capítulo 4. */
const errorResponse = (description: string) => ({
  description,
  ...json(ref('ErrorEnvelope')),
});

/** Descarga exitosa: binario sin envoltura JSON (6.8.6 y 6.8.10). */
const binaryResponse = (description: string) => ({
  description,
  headers: {
    'Content-Type': { schema: { type: 'string', example: 'application/pdf' } },
    'Content-Disposition': {
      schema: {
        type: 'string',
        example: 'attachment; filename="planeacion.pdf"',
      },
    },
  },
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      schema: { type: 'string', format: 'binary' },
    },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      {
        schema: { type: 'string', format: 'binary' },
      },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      schema: { type: 'string', format: 'binary' },
    },
  },
});

/** Cuerpo multipart con el archivo y sus campos de texto. */
const multipart = (schema: object, required: boolean) => ({
  required,
  content: { 'multipart/form-data': { schema } },
});

const Errors = {
  400: errorResponse('400 BAD_REQUEST: JSON inválido o cuerpo ausente.'),
  401: errorResponse(
    '401 AUTH_INVALID_CREDENTIALS / AUTH_TOKEN_EXPIRED / AUTH_TOKEN_REVOKED.',
  ),
  403: errorResponse('403 AUTH_USER_INACTIVE / FORBIDDEN_ROLE.'),
  404: errorResponse('404 RESOURCE_NOT_FOUND.'),
  409: errorResponse(
    '409 CONFLICT_UNIQUE: correo o institutionalId duplicado.',
  ),
  422: errorResponse('422 VALIDATION_ERROR con error.details por campo.'),
  429: errorResponse('429 RATE_LIMIT_EXCEEDED: demasiados intentos.'),
  500: errorResponse('500 INTERNAL_ERROR.'),
} as const;

/** Errores propios de las subidas y descargas de materiales (capítulo 6.8). */
const MaterialErrors = {
  400: errorResponse('400 BAD_REQUEST: falta el campo `file`.'),
  401: Errors[401],
  403: errorResponse(
    '403 FORBIDDEN_ROLE / FORBIDDEN_OWNERSHIP / FORBIDDEN_SUBJECT_ASSIGNMENT.',
  ),
  404: errorResponse('404 RESOURCE_NOT_FOUND / VERSION_NOT_FOUND.'),
  413: errorResponse('413 FILE_TOO_LARGE: el archivo supera 25 MB.'),
  415: errorResponse(
    '415 FILE_TYPE_NOT_ALLOWED: la extensión y el MIME deben coincidir con PDF, Word, PowerPoint o Excel.',
  ),
  422: Errors[422],
  503: errorResponse('503: el almacenamiento de archivos no está disponible.'),
} as const;

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const versionNumberParam = {
  name: 'versionNumber',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const MATERIAL_TYPES = [
  'PLANEACION',
  'TEMARIO',
  'APUNTE',
  'DIAPOSITIVA',
  'PRACTICA',
  'EVALUACION',
  'OTRO',
];
const MATERIAL_VISIBILITIES = ['ESTUDIANTES_Y_DOCENTES', 'SOLO_DOCENTES'];

// ========================================================================= //
//                                 DOCUMENT                                  //
// ========================================================================= //

/**
 * OpenAPI 3.0 de SIGRA (ContratoAPI-SIGRA v1.2). Cada actividad agrega aquí
 * sus rutas en `paths` y sus Resources/Requests en `components.schemas`.
 */
const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SIGRA API',
    version: API_VERSION,
    description:
      'Sistema de Gestión de Recursos Académicos — Instituto Tecnológico de Oaxaca. ' +
      'Toda respuesta JSON usa la envoltura { success, message, data } y todo error la estructura del capítulo 4 del contrato.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Salud', description: '6.9.3' },
    { name: 'Autenticación', description: '6.1' },
    { name: 'Usuarios', description: '6.2 (solo ADMIN)' },
    { name: 'Roles', description: '6.2.6–6.2.7' },
    { name: 'Institutos', description: '6.3' },
    { name: 'Carreras', description: '6.4' },
    { name: 'Periodos académicos', description: '6.5' },
    { name: 'Materias', description: '6.6' },
    { name: 'Asignaciones', description: '6.7' },
    { name: 'Materiales', description: '6.8 (materiales y versiones)' },
    { name: 'Auditoría', description: '6.9.1–6.9.2 (solo ADMIN)' },
    { name: 'Dashboard', description: '6.10 (cualquier rol)' },
  ],
  // Seguridad Bearer por defecto (contrato 2.1); las rutas públicas la anulan.
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Autenticación'],
        summary: 'Registrar usuario (6.1.1)',
        security: [],
        requestBody: {
          required: true,
          ...json(ref('RegisterRequest')),
        },
        responses: {
          201: {
            description: 'Sesión de estudiante o UserResource de docente.',
            ...json(
              envelope({
                oneOf: [ref('AuthSessionResource'), ref('UserResource')],
              }),
            ),
          },
          400: Errors[400],
          409: Errors[409],
          422: Errors[422],
          429: Errors[429],
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autenticación'],
        summary: 'Iniciar sesión (6.1.2)',
        security: [],
        requestBody: {
          required: true,
          ...json(ref('LoginRequest')),
        },
        responses: {
          200: {
            description: 'Sesión autenticada.',
            ...json(envelope(ref('AuthSessionResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          422: Errors[422],
          429: Errors[429],
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Autenticación'],
        summary: 'Cerrar sesión (6.1.3)',
        requestBody: {
          required: false,
          ...json({
            type: 'object',
            properties: { refreshToken: { type: 'string' } },
          }),
        },
        responses: {
          200: {
            description: 'Sesión cerrada.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Autenticación'],
        summary: 'Renovar sesión (6.1.4)',
        security: [],
        requestBody: {
          required: true,
          ...json(ref('RefreshTokenRequest')),
        },
        responses: {
          200: {
            description: 'Sesión renovada; omite el usuario.',
            ...json(envelope(ref('AuthSessionResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          422: Errors[422],
          429: Errors[429],
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Autenticación'],
        summary: 'Obtener perfil propio (6.1.5)',
        responses: {
          200: {
            description: 'UserResource del usuario autenticado.',
            ...json(envelope(ref('UserResource'))),
          },
          401: Errors[401],
        },
      },
    },
    '/auth/me/password': {
      patch: {
        tags: ['Autenticación'],
        summary: 'Cambiar contraseña propia (6.1.6)',
        requestBody: {
          required: true,
          ...json(ref('ChangePasswordRequest')),
        },
        responses: {
          200: {
            description: 'Contraseña actualizada.',
            ...json(envelope({ nullable: true, example: null })),
          },
          400: Errors[400],
          401: Errors[401],
          422: Errors[422],
        },
      },
    },
    '/roles': {
      get: {
        tags: ['Roles'],
        summary: 'Listar roles (6.2.6)',
        responses: {
          200: {
            description: 'Colección de roles.',
            ...json(envelope({ type: 'array', items: ref('RoleResource') })),
          },
          401: Errors[401],
          403: Errors[403],
        },
      },
    },
    '/roles/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Roles'],
        summary: 'Obtener rol (6.2.7)',
        responses: {
          200: {
            description: 'RoleResource.',
            ...json(envelope(ref('RoleResource'))),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          422: Errors[422],
        },
      },
    },
    '/health': {
      get: {
        tags: ['Salud'],
        summary: 'Verificar salud',
        security: [],
        responses: {
          200: {
            description: 'Todas las dependencias responden.',
            ...json(envelope(ref('HealthResource'))),
          },
          503: {
            description: 'Alguna dependencia está caída; status = degraded.',
            ...json(envelope(ref('HealthResource'))),
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Usuarios'],
        summary: 'Listar usuarios (6.2.1)',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'lastName:asc',
                'lastName:desc',
                'createdAt:asc',
                'createdAt:desc',
              ],
              default: 'lastName:asc',
            },
          },
          { name: 'roleId', in: 'query', schema: { type: 'integer' } },
          { name: 'role', in: 'query', schema: ref('RoleName') },
          { name: 'careerId', in: 'query', schema: { type: 'integer' } },
          { name: 'instituteId', in: 'query', schema: { type: 'integer' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de UserResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: ref('UserResource') },
                  },
                },
              ],
            }),
          },
          422: Errors[422],
        },
      },
      post: {
        tags: ['Usuarios'],
        summary: 'Crear usuario (6.2.2)',
        requestBody: { required: true, ...json(ref('CreateUserRequest')) },
        responses: {
          201: {
            description: 'UserResource creado, sin tokens.',
            ...json(envelope(ref('UserResource'))),
          },
          400: Errors[400],
          409: Errors[409],
          422: Errors[422],
        },
      },
    },
    '/users/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Usuarios'],
        summary: 'Obtener usuario (6.2.3)',
        responses: {
          200: {
            description: 'UserResource.',
            ...json(envelope(ref('UserResource'))),
          },
          404: Errors[404],
          422: Errors[422],
        },
      },
      patch: {
        tags: ['Usuarios'],
        summary: 'Actualizar usuario (6.2.4)',
        requestBody: { required: true, ...json(ref('UpdateUserRequest')) },
        responses: {
          200: {
            description: 'UserResource actualizado.',
            ...json(envelope(ref('UserResource'))),
          },
          400: Errors[400],
          404: Errors[404],
          409: Errors[409],
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Usuarios'],
        summary: 'Eliminar usuario — baja lógica (6.2.5)',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          404: Errors[404],
          409: errorResponse(
            '409 RESOURCE_HAS_DEPENDENCIES: dejaría el sistema sin administradores activos.',
          ),
        },
      },
    },
    '/institutes': {
      get: {
        tags: ['Institutos'],
        summary: 'Listar institutos (6.3.1)',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'name:asc',
                'name:desc',
                'code:asc',
                'code:desc',
                'createdAt:asc',
                'createdAt:desc',
              ],
              default: 'name:asc',
            },
          },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de InstituteResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: ref('InstituteResource') },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          422: Errors[422],
        },
      },
      post: {
        tags: ['Institutos'],
        summary: 'Crear instituto (6.3.2)',
        requestBody: { required: true, ...json(ref('CreateInstituteRequest')) },
        responses: {
          201: {
            description: 'InstituteResource creado.',
            ...json(envelope(ref('InstituteResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          409: Errors[409],
          422: Errors[422],
        },
      },
    },
    '/institutes/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Institutos'],
        summary: 'Obtener instituto (6.3.3)',
        responses: {
          200: {
            description: 'InstituteResource.',
            ...json(envelope(ref('InstituteResource'))),
          },
          401: Errors[401],
          404: Errors[404],
          422: Errors[422],
        },
      },
      patch: {
        tags: ['Institutos'],
        summary: 'Actualizar instituto (6.3.4)',
        requestBody: { required: true, ...json(ref('UpdateInstituteRequest')) },
        responses: {
          200: {
            description: 'InstituteResource actualizado.',
            ...json(envelope(ref('InstituteResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: Errors[409],
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Institutos'],
        summary: 'Eliminar instituto (6.3.5)',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 RESOURCE_HAS_DEPENDENCIES: el instituto tiene carreras o usuarios asociados.',
          ),
        },
      },
    },
    '/careers': {
      get: {
        tags: ['Carreras'],
        summary: 'Listar carreras (6.4.1)',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'name:asc',
                'name:desc',
                'curriculumCode:asc',
                'curriculumCode:desc',
                'createdAt:asc',
                'createdAt:desc',
              ],
              default: 'name:asc',
            },
          },
          { name: 'instituteId', in: 'query', schema: { type: 'integer' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de CareerResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: ref('CareerResource') },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          422: Errors[422],
        },
      },
      post: {
        tags: ['Carreras'],
        summary: 'Crear carrera (6.4.2)',
        requestBody: { required: true, ...json(ref('CreateCareerRequest')) },
        responses: {
          201: {
            description: 'CareerResource creado.',
            ...json(envelope(ref('CareerResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          409: Errors[409],
          422: Errors[422],
        },
      },
    },
    '/careers/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Carreras'],
        summary: 'Obtener carrera (6.4.3)',
        responses: {
          200: {
            description: 'CareerResource.',
            ...json(envelope(ref('CareerResource'))),
          },
          401: Errors[401],
          404: Errors[404],
          422: Errors[422],
        },
      },
      patch: {
        tags: ['Carreras'],
        summary: 'Actualizar carrera (6.4.4)',
        requestBody: { required: true, ...json(ref('UpdateCareerRequest')) },
        responses: {
          200: {
            description: 'CareerResource actualizado.',
            ...json(envelope(ref('CareerResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: Errors[409],
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Carreras'],
        summary: 'Eliminar carrera (6.4.5)',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 RESOURCE_HAS_DEPENDENCIES: la carrera tiene materias o usuarios asociados.',
          ),
        },
      },
    },
    '/academic-periods': {
      get: {
        tags: ['Periodos académicos'],
        summary: 'Listar periodos académicos (6.5.1)',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'code:asc',
                'code:desc',
                'name:asc',
                'name:desc',
                'startDate:asc',
                'startDate:desc',
                'endDate:asc',
                'endDate:desc',
                'createdAt:asc',
                'createdAt:desc',
              ],
              default: 'startDate:desc',
            },
          },
          { name: 'isCurrent', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de AcademicPeriodResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: ref('AcademicPeriodResource'),
                    },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          422: Errors[422],
        },
      },
      post: {
        tags: ['Periodos académicos'],
        summary: 'Crear periodo académico (6.5.2, solo ADMIN)',
        description: 'El periodo nace con isCurrent en false.',
        requestBody: {
          required: true,
          ...json(ref('CreateAcademicPeriodRequest')),
        },
        responses: {
          201: {
            description: 'AcademicPeriodResource creado.',
            ...json(envelope(ref('AcademicPeriodResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          409: errorResponse(
            '409 CONFLICT_UNIQUE: el código de periodo ya existe.',
          ),
          422: Errors[422],
        },
      },
    },
    '/academic-periods/current': {
      get: {
        tags: ['Periodos académicos'],
        summary: 'Obtener el periodo vigente (6.5.3)',
        description:
          'Se evalúa antes que GET /academic-periods/{id}; 404 si ninguno está fijado como vigente.',
        responses: {
          200: {
            description: 'AcademicPeriodResource vigente.',
            ...json(envelope(ref('AcademicPeriodResource'))),
          },
          401: Errors[401],
          404: Errors[404],
        },
      },
    },
    '/academic-periods/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Periodos académicos'],
        summary: 'Obtener periodo académico (6.5.4)',
        responses: {
          200: {
            description: 'AcademicPeriodResource.',
            ...json(envelope(ref('AcademicPeriodResource'))),
          },
          401: Errors[401],
          404: Errors[404],
          422: Errors[422],
        },
      },
      patch: {
        tags: ['Periodos académicos'],
        summary: 'Actualizar periodo académico (6.5.5, solo ADMIN)',
        description:
          'Actualización parcial. No acepta isCurrent: use 6.5.6 para cambiar la vigencia.',
        requestBody: {
          required: true,
          ...json(ref('UpdateAcademicPeriodRequest')),
        },
        responses: {
          200: {
            description: 'AcademicPeriodResource actualizado.',
            ...json(envelope(ref('AcademicPeriodResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 CONFLICT_UNIQUE: el código de periodo ya existe.',
          ),
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Periodos académicos'],
        summary: 'Eliminar periodo académico (6.5.7, solo ADMIN)',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 RESOURCE_HAS_DEPENDENCIES: el periodo tiene asignaciones o materiales.',
          ),
        },
      },
    },
    '/academic-periods/{id}/set-current': {
      parameters: [idParam],
      patch: {
        tags: ['Periodos académicos'],
        summary: 'Definir el periodo vigente (6.5.6, solo ADMIN)',
        description:
          'Desmarca el periodo vigente anterior y marca este en la misma operación.',
        responses: {
          200: {
            description: 'AcademicPeriodResource fijado como vigente.',
            ...json(envelope(ref('AcademicPeriodResource'))),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse('409 PERIOD_ALREADY_CURRENT: ya es el vigente.'),
        },
      },
    },
    '/subjects': {
      get: {
        tags: ['Materias'],
        summary: 'Listar materias (6.6.1)',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          {
            name: 'search',
            in: 'query',
            description: 'Busca por nombre o clave de la materia.',
            schema: { type: 'string' },
          },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'semester:asc',
                'semester:desc',
                'code:asc',
                'code:desc',
                'name:asc',
                'name:desc',
              ],
              default: 'semester:asc',
            },
          },
          { name: 'careerId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'semester',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 12 },
          },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de SubjectResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: ref('SubjectResource') },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          422: Errors[422],
        },
      },
      post: {
        tags: ['Materias'],
        summary: 'Crear materia (6.6.2, solo ADMIN)',
        requestBody: { required: true, ...json(ref('CreateSubjectRequest')) },
        responses: {
          201: {
            description: 'SubjectResource creado.',
            ...json(envelope(ref('SubjectResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          409: errorResponse(
            '409 CONFLICT_UNIQUE: el código ya existe en la carrera.',
          ),
          422: Errors[422],
        },
      },
    },
    '/subjects/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Materias'],
        summary: 'Obtener materia (6.6.3)',
        responses: {
          200: {
            description: 'SubjectResource.',
            ...json(envelope(ref('SubjectResource'))),
          },
          401: Errors[401],
          404: Errors[404],
          422: Errors[422],
        },
      },
      patch: {
        tags: ['Materias'],
        summary: 'Actualizar materia (6.6.4, solo ADMIN)',
        requestBody: { required: true, ...json(ref('UpdateSubjectRequest')) },
        responses: {
          200: {
            description: 'SubjectResource actualizado.',
            ...json(envelope(ref('SubjectResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 CONFLICT_UNIQUE: el código ya existe en la carrera.',
          ),
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Materias'],
        summary: 'Eliminar materia (6.6.5, solo ADMIN)',
        description:
          'Bloqueada si tiene asignaciones o materiales; use isActive en false como alternativa.',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          409: errorResponse(
            '409 RESOURCE_HAS_DEPENDENCIES: la materia tiene asignaciones o materiales.',
          ),
        },
      },
    },
    '/subject-assignments': {
      get: {
        tags: ['Asignaciones'],
        summary: 'Listar asignaciones de carga académica (6.7.1)',
        description:
          'ADMIN ve todas; DOCENTE siempre solo las suyas. ESTUDIANTE recibe 403 FORBIDDEN_ROLE.',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'createdAt:asc',
                'createdAt:desc',
                'groupCode:asc',
                'groupCode:desc',
                'id:asc',
                'id:desc',
              ],
              default: 'createdAt:desc',
            },
          },
          { name: 'teacherId', in: 'query', schema: { type: 'integer' } },
          { name: 'subjectId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'academicPeriodId',
            in: 'query',
            schema: { type: 'integer' },
          },
          { name: 'groupCode', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Colección paginada de SubjectAssignmentResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: ref('SubjectAssignmentResource'),
                    },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          403: errorResponse('403 FORBIDDEN_ROLE: rol ESTUDIANTE.'),
          422: Errors[422],
        },
      },
      post: {
        tags: ['Asignaciones'],
        summary: 'Crear asignación de carga académica (6.7.2, solo ADMIN)',
        description: 'assignedBy se toma del token del administrador.',
        requestBody: {
          required: true,
          ...json(ref('CreateSubjectAssignmentRequest')),
        },
        responses: {
          201: {
            description: 'SubjectAssignmentResource creado.',
            ...json(envelope(ref('SubjectAssignmentResource'))),
          },
          400: Errors[400],
          401: Errors[401],
          403: Errors[403],
          409: errorResponse(
            '409 ASSIGNMENT_DUPLICATED: ya existe esa combinación de materia, docente, periodo y grupo.',
          ),
          422: Errors[422],
        },
      },
    },
    '/subject-assignments/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Asignaciones'],
        summary: 'Obtener asignación (6.7.3)',
        description:
          'DOCENTE solo si la asignación es suya; si es de otro, 403 FORBIDDEN_OWNERSHIP.',
        responses: {
          200: {
            description: 'SubjectAssignmentResource.',
            ...json(envelope(ref('SubjectAssignmentResource'))),
          },
          401: Errors[401],
          403: errorResponse(
            '403 FORBIDDEN_OWNERSHIP: la asignación pertenece a otro docente.',
          ),
          404: Errors[404],
          422: Errors[422],
        },
      },
      delete: {
        tags: ['Asignaciones'],
        summary: 'Eliminar asignación (6.7.4, solo ADMIN)',
        description:
          'Borrado físico; no elimina la materia ni al docente. No existe PATCH en v1.',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          422: Errors[422],
        },
      },
    },
    '/materials': {
      get: {
        tags: ['Materiales'],
        summary: 'Listar y buscar materiales (6.8.1)',
        description:
          'ESTUDIANTE nunca recibe SOLO_DOCENTES ni no aprobados; el filtro visibility solo aplica a ADMIN y DOCENTE. instituteId se resuelve vía materia y carrera.',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/search' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'createdAt:asc',
                'createdAt:desc',
                'title:asc',
                'title:desc',
                'downloadCount:asc',
                'downloadCount:desc',
              ],
              default: 'createdAt:desc',
            },
          },
          { name: 'instituteId', in: 'query', schema: { type: 'integer' } },
          { name: 'subjectId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'academicPeriodId',
            in: 'query',
            schema: { type: 'integer' },
          },
          { name: 'authorId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'materialType',
            in: 'query',
            schema: { type: 'string', enum: MATERIAL_TYPES },
          },
          {
            name: 'visibility',
            in: 'query',
            schema: {
              type: 'string',
              enum: MATERIAL_VISIBILITIES,
            },
          },
        ],
        responses: {
          200: {
            description:
              'Colección paginada de MaterialResource, sin currentVersionDetail.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: ref('MaterialResource'),
                    },
                  },
                },
              ],
            }),
          },
          401: MaterialErrors[401],
          422: MaterialErrors[422],
        },
      },
      post: {
        tags: ['Materiales'],
        summary: 'Crear material con su primera versión (6.8.2)',
        description:
          'DOCENTE o ADMIN. El autor lo fija el token; el DOCENTE debe tener una SubjectAssignment para la materia. Crea la versión 1 con checksum SHA-256 y registra MATERIAL_UPLOADED.',
        requestBody: multipart(ref('CreateMaterialRequest'), true),
        responses: {
          201: {
            description: 'MaterialResource con currentVersionDetail.',
            ...json(envelope(ref('MaterialDetailResource'))),
          },
          400: MaterialErrors[400],
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          413: MaterialErrors[413],
          415: MaterialErrors[415],
          422: MaterialErrors[422],
        },
      },
    },
    '/materials/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Materiales'],
        summary: 'Obtener material (6.8.3)',
        description: 'Incluye el detalle de la versión vigente.',
        responses: {
          200: {
            description: 'MaterialResource con currentVersionDetail.',
            ...json(envelope(ref('MaterialDetailResource'))),
          },
          401: MaterialErrors[401],
          404: MaterialErrors[404],
        },
      },
      patch: {
        tags: ['Materiales'],
        summary: 'Editar los datos del material (6.8.4)',
        description:
          'Autor o ADMIN. Actualización parcial; nunca cambia el archivo. isApproved solo lo aplica ADMIN.',
        requestBody: {
          required: true,
          ...json(ref('UpdateMaterialRequest')),
        },
        responses: {
          200: {
            description: 'MaterialResource actualizado.',
            ...json(envelope(ref('MaterialResource'))),
          },
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
          422: MaterialErrors[422],
        },
      },
      delete: {
        tags: ['Materiales'],
        summary: 'Eliminar material (6.8.5, baja lógica)',
        description:
          'Autor o ADMIN. Sus versiones dejan de ser descargables; el historial queda para auditoría.',
        responses: {
          200: {
            description: 'data en null con mensaje de confirmación.',
            ...json(envelope({ nullable: true, example: null })),
          },
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
        },
      },
    },
    '/materials/{id}/download': {
      parameters: [idParam],
      get: {
        tags: ['Materiales'],
        summary: 'Descargar la versión vigente (6.8.6)',
        description:
          'Binario sin envoltura JSON. Cada descarga incrementa downloadCount. Un estudiante con material SOLO_DOCENTES recibe 404.',
        responses: {
          200: binaryResponse('Archivo binario de la versión vigente.'),
          401: MaterialErrors[401],
          404: MaterialErrors[404],
          503: MaterialErrors[503],
        },
      },
    },
    '/materials/{id}/versions': {
      parameters: [idParam],
      get: {
        tags: ['Materiales'],
        summary: 'Historial de versiones (6.8.7, solo DOCENTE o ADMIN)',
        description: 'De la versión más reciente a la más antigua.',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'versionNumber:asc',
                'versionNumber:desc',
                'createdAt:asc',
                'createdAt:desc',
              ],
              default: 'versionNumber:desc',
            },
          },
        ],
        responses: {
          200: {
            description: 'Colección paginada de MaterialVersionResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: ref('MaterialVersionResource'),
                    },
                  },
                },
              ],
            }),
          },
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
        },
      },
      post: {
        tags: ['Materiales'],
        summary: 'Subir una versión nueva (6.8.8)',
        description:
          'Autor o ADMIN. El DOCENTE debe conservar su asignación. El consecutivo currentVersion + 1 lo fija el backend; auditoría PLANEACION_VERSIONED o MATERIAL_VERSIONED.',
        requestBody: multipart(ref('CreateMaterialVersionRequest'), true),
        responses: {
          201: {
            description: 'MaterialVersionResource creado.',
            ...json(envelope(ref('MaterialVersionResource'))),
          },
          400: MaterialErrors[400],
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
          413: MaterialErrors[413],
          415: MaterialErrors[415],
        },
      },
    },
    '/materials/{id}/versions/{versionNumber}': {
      parameters: [idParam, versionNumberParam],
      get: {
        tags: ['Materiales'],
        summary: 'Obtener metadatos de una versión (6.8.9)',
        description: 'Solo DOCENTE o ADMIN; sin binario y sin storagePath.',
        responses: {
          200: {
            description: 'MaterialVersionResource.',
            ...json(envelope(ref('MaterialVersionResource'))),
          },
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
        },
      },
    },
    '/materials/{id}/versions/{versionNumber}/download': {
      parameters: [idParam, versionNumberParam],
      get: {
        tags: ['Materiales'],
        summary: 'Descargar una versión concreta (6.8.10)',
        description:
          'Solo DOCENTE o ADMIN. Binario sin envoltura JSON; incrementa downloadCount.',
        responses: {
          200: binaryResponse('Archivo binario de la versión indicada.'),
          401: MaterialErrors[401],
          403: MaterialErrors[403],
          404: MaterialErrors[404],
          503: MaterialErrors[503],
        },
      },
    },
    '/audit-logs': {
      get: {
        tags: ['Auditoría'],
        summary: 'Listar eventos de auditoría (6.9.1)',
        description:
          'Más recientes primero (orden fijo; sort se ignora). Los eventos llegan vía RabbitMQ y pueden tardar unos segundos en aparecer.',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'userId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'action',
            in: 'query',
            schema: { type: 'string', maxLength: 60, example: 'USER_CREATED' },
          },
          {
            name: 'entityName',
            in: 'query',
            schema: { type: 'string', maxLength: 60, example: 'users' },
          },
          { name: 'entityId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'from',
            in: 'query',
            description: 'Fecha ISO 8601 (inclusive).',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'to',
            in: 'query',
            description: 'Fecha ISO 8601 (inclusive). Debe ser ≥ from.',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          200: {
            description: 'Colección paginada de AuditLogResource.',
            ...json({
              allOf: [
                ref('PaginatedEnvelope'),
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: ref('AuditLogResource') },
                  },
                },
              ],
            }),
          },
          401: Errors[401],
          403: Errors[403],
          422: Errors[422],
        },
      },
    },
    '/audit-logs/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Auditoría'],
        summary: 'Obtener evento de auditoría (6.9.2)',
        responses: {
          200: {
            description: 'AuditLogResource con su metadata.',
            ...json(envelope(ref('AuditLogResource'))),
          },
          401: Errors[401],
          403: Errors[403],
          404: Errors[404],
          422: Errors[422],
        },
      },
    },
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Obtener resumen del dashboard (6.10.1)',
        description:
          'Métricas según el rol del token, cacheadas en Redis 60 s por usuario. ESTUDIANTE recibe myAssignments y myMaterials en null; ADMIN recibe totales globales.',
        responses: {
          200: {
            description: 'DashboardSummaryResource.',
            ...json(envelope(ref('DashboardSummaryResource'))),
          },
          401: Errors[401],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      limit: {
        name: 'limit',
        in: 'query',
        description: 'Mayor a 100 se ajusta a 100.',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      search: { name: 'search', in: 'query', schema: { type: 'string' } },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          message: {
            type: 'string',
            example: 'Operación completada correctamente.',
          },
          data: {},
        },
      },
      PaginatedEnvelope: {
        allOf: [
          ref('SuccessEnvelope'),
          {
            type: 'object',
            required: ['meta', 'links'],
            properties: {
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'integer', example: 57 },
                  page: { type: 'integer', example: 1 },
                  limit: { type: 'integer', example: 20 },
                  totalPages: { type: 'integer', example: 3 },
                },
              },
              links: {
                type: 'object',
                properties: {
                  self: {
                    type: 'string',
                    example: '/api/v1/users?page=1&limit=20',
                  },
                  next: {
                    type: 'string',
                    nullable: true,
                    example: '/api/v1/users?page=2&limit=20',
                  },
                  prev: { type: 'string', nullable: true, example: null },
                },
              },
            },
          },
        ],
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['success', 'message', 'data', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          message: {
            type: 'string',
            example: 'Los datos enviados no son válidos.',
          },
          data: { nullable: true, example: null },
          error: {
            type: 'object',
            required: ['code'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string', example: 'email' },
                    message: {
                      type: 'string',
                      example: 'El correo ya está registrado.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 150,
            example: 'usuario@itoaxaca.edu.mx',
          },
          password: { type: 'string', maxLength: 128 },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: [
          'institutionalId',
          'firstName',
          'lastName',
          'email',
          'password',
          'role',
          'instituteId',
          'careerId',
        ],
        properties: {
          institutionalId: { type: 'string', maxLength: 30 },
          firstName: {
            type: 'string',
            maxLength: 100,
            description: 'Solo letras y espacios simples.',
          },
          lastName: {
            type: 'string',
            maxLength: 120,
            description: 'Solo letras y espacios simples.',
          },
          email: { type: 'string', format: 'email', maxLength: 150 },
          password: {
            type: 'string',
            minLength: 8,
            description:
              'Mínimo 8, con mayúscula, minúscula, número y símbolo.',
          },
          role: { type: 'string', enum: ['ESTUDIANTE', 'DOCENTE'] },
          instituteId: { type: 'integer', minimum: 1 },
          careerId: { type: 'integer', minimum: 1 },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', maxLength: 500 },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', maxLength: 128 },
          newPassword: {
            type: 'string',
            minLength: 8,
            description:
              'Mínimo 8, con mayúscula, minúscula, número y símbolo; debe diferir de la contraseña actual.',
          },
        },
      },
      AuthSessionResource: {
        type: 'object',
        required: ['accessToken', 'refreshToken', 'tokenType', 'expiresIn'],
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          tokenType: { type: 'string', enum: ['Bearer'] },
          expiresIn: { type: 'integer', example: 3600 },
          user: ref('UserResource'),
        },
      },
      RoleResource: {
        type: 'object',
        required: ['id', 'name', 'description', 'createdAt'],
        properties: {
          id: { type: 'integer', example: 1 },
          name: ref('RoleName'),
          description: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RoleName: { type: 'string', enum: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
      UserResource: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          roleId: { type: 'integer', example: 2 },
          role: ref('RoleName'),
          instituteId: { type: 'integer', example: 1 },
          careerId: { type: 'integer', nullable: true, example: 1 },
          institutionalId: { type: 'string', example: '22161058' },
          firstName: { type: 'string', example: 'Wilver Alfredo' },
          lastName: { type: 'string', example: 'Flores Santiago' },
          email: { type: 'string', example: 'usuario@itoaxaca.edu.mx' },
          isActive: { type: 'boolean', example: true },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateUserRequest: {
        type: 'object',
        required: [
          'institutionalId',
          'firstName',
          'lastName',
          'email',
          'password',
          'role',
          'instituteId',
        ],
        properties: {
          institutionalId: {
            type: 'string',
            maxLength: 30,
            example: '22161058',
          },
          firstName: {
            type: 'string',
            maxLength: 100,
            description: 'Solo letras y espacios simples.',
            example: 'Wilver Alfredo',
          },
          lastName: {
            type: 'string',
            maxLength: 120,
            description: 'Solo letras y espacios simples.',
            example: 'Flores Santiago',
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 150,
            example: 'usuario@itoaxaca.edu.mx',
          },
          password: {
            type: 'string',
            minLength: 8,
            description:
              'Mínimo 8, con mayúscula, minúscula, número y símbolo.',
            example: 'ClaveSegura1!',
          },
          role: ref('RoleName'),
          instituteId: { type: 'integer', example: 1 },
          careerId: {
            type: 'integer',
            nullable: true,
            description: 'Solo se omite si el rol es ADMIN.',
            example: 1,
          },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía solo lo que cambia.',
        properties: {
          institutionalId: { type: 'string', maxLength: 30 },
          firstName: { type: 'string', maxLength: 100 },
          lastName: { type: 'string', maxLength: 120 },
          email: { type: 'string', format: 'email' },
          role: ref('RoleName'),
          careerId: { type: 'integer', nullable: true },
          isActive: { type: 'boolean' },
        },
      },
      InstituteResource: {
        type: 'object',
        required: [
          'id',
          'code',
          'name',
          'shortName',
          'city',
          'state',
          'isActive',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'integer', minimum: 1, example: 1 },
          code: { type: 'string', maxLength: 30, example: 'ITO' },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Instituto Tecnológico de Oaxaca',
          },
          shortName: { type: 'string', maxLength: 30, example: 'ITO' },
          city: { type: 'string', maxLength: 100, example: 'Oaxaca' },
          state: { type: 'string', maxLength: 100, example: 'Oaxaca' },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateInstituteRequest: {
        type: 'object',
        required: ['code', 'name', 'shortName', 'city', 'state'],
        properties: {
          code: { type: 'string', maxLength: 30, example: 'ITO' },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Instituto Tecnológico de Oaxaca',
          },
          shortName: { type: 'string', maxLength: 30, example: 'ITO' },
          city: { type: 'string', maxLength: 100, example: 'Oaxaca' },
          state: { type: 'string', maxLength: 100, example: 'Oaxaca' },
          isActive: { type: 'boolean', default: true, example: true },
        },
      },
      UpdateInstituteRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía al menos uno para actualizar.',
        properties: {
          code: { type: 'string', maxLength: 30 },
          name: { type: 'string', maxLength: 180 },
          shortName: { type: 'string', maxLength: 30 },
          city: { type: 'string', maxLength: 100 },
          state: { type: 'string', maxLength: 100 },
          isActive: { type: 'boolean' },
        },
      },
      CareerResource: {
        type: 'object',
        required: [
          'id',
          'instituteId',
          'curriculumCode',
          'name',
          'shortName',
          'totalSemesters',
          'isActive',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'integer', minimum: 1, example: 1 },
          instituteId: { type: 'integer', minimum: 1, example: 1 },
          curriculumCode: {
            type: 'string',
            maxLength: 40,
            example: 'ISC-2010',
          },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Ingeniería en Sistemas Computacionales',
          },
          shortName: {
            type: 'string',
            maxLength: 20,
            example: 'ISC',
          },
          totalSemesters: {
            type: 'integer',
            minimum: 1,
            maximum: 14,
            example: 9,
          },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateCareerRequest: {
        type: 'object',
        required: ['curriculumCode', 'name', 'shortName', 'instituteId'],
        properties: {
          curriculumCode: {
            type: 'string',
            maxLength: 40,
            example: 'ISC-2010',
          },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Ingeniería en Sistemas Computacionales',
          },
          shortName: { type: 'string', maxLength: 20, example: 'ISC' },
          totalSemesters: {
            type: 'integer',
            minimum: 1,
            maximum: 14,
            default: 9,
            example: 9,
          },
          instituteId: { type: 'integer', minimum: 1, example: 1 },
          isActive: { type: 'boolean', default: true, example: true },
        },
      },
      UpdateCareerRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía al menos uno para actualizar.',
        properties: {
          curriculumCode: { type: 'string', maxLength: 40 },
          name: { type: 'string', maxLength: 180 },
          shortName: { type: 'string', maxLength: 20 },
          totalSemesters: {
            type: 'integer',
            minimum: 1,
            maximum: 14,
          },
          instituteId: { type: 'integer', minimum: 1 },
          isActive: { type: 'boolean' },
        },
      },
      AcademicPeriodResource: {
        type: 'object',
        required: [
          'id',
          'code',
          'name',
          'startDate',
          'endDate',
          'isCurrent',
          'createdAt',
        ],
        properties: {
          id: { type: 'integer', example: 2 },
          code: { type: 'string', maxLength: 20, example: '2026-2' },
          name: {
            type: 'string',
            maxLength: 100,
            example: 'Agosto - Diciembre 2026',
          },
          startDate: { type: 'string', format: 'date', example: '2026-08-24' },
          endDate: { type: 'string', format: 'date', example: '2026-12-11' },
          isCurrent: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateAcademicPeriodRequest: {
        type: 'object',
        required: ['code', 'name', 'startDate', 'endDate'],
        properties: {
          code: { type: 'string', maxLength: 20, example: '2026-2' },
          name: {
            type: 'string',
            maxLength: 100,
            example: 'Agosto - Diciembre 2026',
          },
          startDate: { type: 'string', format: 'date', example: '2026-08-24' },
          endDate: { type: 'string', format: 'date', example: '2026-12-11' },
        },
        description:
          'endDate debe ser posterior a startDate. No acepta isCurrent.',
      },
      UpdateAcademicPeriodRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía al menos uno. No acepta isCurrent.',
        properties: {
          code: { type: 'string', maxLength: 20 },
          name: { type: 'string', maxLength: 100 },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
        },
      },
      SubjectResource: {
        type: 'object',
        required: [
          'id',
          'careerId',
          'code',
          'name',
          'semester',
          'creditsTheory',
          'creditsPractice',
          'totalCredits',
          'isActive',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'integer', example: 3 },
          careerId: { type: 'integer', example: 1 },
          code: { type: 'string', maxLength: 30, example: 'DSD-2303' },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Desarrollo de Servicios Web',
          },
          semester: { type: 'integer', minimum: 1, maximum: 12, example: 8 },
          creditsTheory: { type: 'integer', minimum: 0, example: 2 },
          creditsPractice: { type: 'integer', minimum: 0, example: 3 },
          totalCredits: {
            type: 'integer',
            readOnly: true,
            example: 5,
            description: 'Calculado: creditsTheory + creditsPractice.',
          },
          syllabusSummary: { type: 'string', nullable: true },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateSubjectRequest: {
        type: 'object',
        required: [
          'careerId',
          'code',
          'name',
          'semester',
          'creditsTheory',
          'creditsPractice',
        ],
        properties: {
          careerId: { type: 'integer', minimum: 1, example: 1 },
          code: { type: 'string', maxLength: 30, example: 'DSD-2303' },
          name: {
            type: 'string',
            maxLength: 180,
            example: 'Desarrollo de Servicios Web',
          },
          semester: { type: 'integer', minimum: 1, maximum: 12, example: 8 },
          creditsTheory: { type: 'integer', minimum: 0, example: 2 },
          creditsPractice: { type: 'integer', minimum: 0, example: 3 },
          syllabusSummary: {
            type: 'string',
            nullable: true,
            example: 'Arquitecturas REST/SOAP, autenticación JWT.',
          },
          isActive: { type: 'boolean', default: true, example: true },
        },
        description: 'No acepta totalCredits: es calculado y de solo lectura.',
      },
      UpdateSubjectRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía al menos uno. No acepta totalCredits.',
        properties: {
          careerId: { type: 'integer', minimum: 1 },
          code: { type: 'string', maxLength: 30 },
          name: { type: 'string', maxLength: 180 },
          semester: { type: 'integer', minimum: 1, maximum: 12 },
          creditsTheory: { type: 'integer', minimum: 0 },
          creditsPractice: { type: 'integer', minimum: 0 },
          syllabusSummary: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
        },
      },
      SubjectAssignmentResource: {
        type: 'object',
        required: [
          'id',
          'subjectId',
          'teacherId',
          'academicPeriodId',
          'groupCode',
          'assignedBy',
          'createdAt',
          'subject',
          'teacher',
          'academicPeriod',
        ],
        properties: {
          id: { type: 'integer', example: 5 },
          subjectId: { type: 'integer', example: 3 },
          teacherId: { type: 'integer', example: 7 },
          academicPeriodId: { type: 'integer', example: 2 },
          groupCode: { type: 'string', maxLength: 20, example: '8SC' },
          assignedBy: {
            type: 'integer',
            nullable: true,
            example: 1,
            description: 'Administrador que registró la asignación.',
          },
          createdAt: { type: 'string', format: 'date-time' },
          subject: ref('SubjectSummary'),
          teacher: ref('TeacherSummary'),
          academicPeriod: ref('PeriodSummary'),
        },
      },
      CreateSubjectAssignmentRequest: {
        type: 'object',
        required: ['subjectId', 'teacherId', 'academicPeriodId', 'groupCode'],
        properties: {
          subjectId: { type: 'integer', minimum: 1, example: 3 },
          teacherId: {
            type: 'integer',
            minimum: 1,
            example: 7,
            description: 'Debe ser un usuario activo con rol DOCENTE.',
          },
          academicPeriodId: { type: 'integer', minimum: 1, example: 2 },
          groupCode: { type: 'string', maxLength: 20, example: '8SC' },
        },
        description:
          'No acepta assignedBy: lo fija el backend desde el token del ADMIN.',
      },
      SubjectSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          code: { type: 'string', example: 'DSD-2303' },
          name: {
            type: 'string',
            example: 'Desarrollo de Servicios Web',
          },
        },
      },
      TeacherSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 7 },
          firstName: { type: 'string', example: 'Wilver Alfredo' },
          lastName: { type: 'string', example: 'Flores Santiago' },
        },
      },
      AuditLogResource: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1024 },
          userId: { type: 'integer', nullable: true, example: 7 },
          action: { type: 'string', example: 'MATERIAL_UPLOADED' },
          entityName: { type: 'string', example: 'materials' },
          entityId: { type: 'integer', nullable: true, example: 8 },
          metadata: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
            example: { materialType: 'PLANEACION', versionNumber: 1 },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      PeriodSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 2 },
          code: { type: 'string', example: '2026-2' },
          name: { type: 'string', example: 'Agosto - Diciembre 2026' },
        },
      },
      MaterialListItem: {
        type: 'object',
        description: 'MaterialResource (5.4.9) en forma de listado.',
        properties: {
          id: { type: 'integer', example: 8 },
          subjectId: { type: 'integer', example: 3 },
          authorId: { type: 'integer', example: 7 },
          academicPeriodId: { type: 'integer', example: 2 },
          title: { type: 'string', example: 'Planeación didáctica 2026-2' },
          description: { type: 'string', nullable: true },
          materialType: { type: 'string', example: 'PLANEACION' },
          visibility: {
            type: 'string',
            enum: ['ESTUDIANTES_Y_DOCENTES', 'SOLO_DOCENTES'],
          },
          currentVersion: { type: 'integer', example: 1 },
          syllabusChangesNote: { type: 'string', nullable: true },
          downloadCount: { type: 'integer', example: 0 },
          isApproved: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          author: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
            },
          },
          subject: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              code: { type: 'string' },
              name: { type: 'string' },
            },
          },
          academicPeriod: ref('PeriodSummary'),
        },
      },
      MaterialResource: {
        type: 'object',
        description:
          'MaterialResource (5.4.9). La proyección de author no expone correo, matrícula ni rol.',
        required: [
          'id',
          'subjectId',
          'authorId',
          'academicPeriodId',
          'title',
          'materialType',
          'visibility',
          'currentVersion',
          'downloadCount',
          'isApproved',
          'createdAt',
          'updatedAt',
          'author',
          'subject',
          'academicPeriod',
        ],
        properties: {
          id: { type: 'integer', example: 8 },
          subjectId: { type: 'integer', example: 3 },
          authorId: { type: 'integer', example: 7 },
          academicPeriodId: { type: 'integer', example: 2 },
          title: {
            type: 'string',
            maxLength: 220,
            example: 'Planeación didáctica 2026-2',
          },
          description: { type: 'string', nullable: true },
          materialType: {
            type: 'string',
            enum: MATERIAL_TYPES,
            example: 'PLANEACION',
          },
          visibility: {
            type: 'string',
            enum: MATERIAL_VISIBILITIES,
            example: 'ESTUDIANTES_Y_DOCENTES',
          },
          currentVersion: {
            type: 'integer',
            readOnly: true,
            example: 1,
            description: 'Solo aumenta al subir una versión nueva.',
          },
          syllabusChangesNote: { type: 'string', nullable: true },
          downloadCount: {
            type: 'integer',
            readOnly: true,
            example: 0,
            description: 'Solo lo incrementa una descarga exitosa.',
          },
          isApproved: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          author: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 7 },
              firstName: { type: 'string', example: 'Wilver Alfredo' },
              lastName: { type: 'string', example: 'Flores Santiago' },
            },
          },
          subject: ref('SubjectSummary'),
          academicPeriod: ref('PeriodSummary'),
        },
      },
      MaterialDetailResource: {
        allOf: [
          ref('MaterialResource'),
          {
            type: 'object',
            properties: {
              currentVersionDetail: ref('MaterialVersionResource'),
            },
          },
        ],
        description:
          'MaterialResource con la versión vigente; solo en 6.8.2 y 6.8.3.',
      },
      MaterialVersionResource: {
        type: 'object',
        description:
          'MaterialVersionResource (5.4.10). Nunca incluye storagePath.',
        required: [
          'id',
          'materialId',
          'versionNumber',
          'originalFileName',
          'mimeType',
          'fileSizeBytes',
          'checksumSha256',
          'uploadedBy',
          'createdAt',
        ],
        properties: {
          id: { type: 'integer', example: 21 },
          materialId: { type: 'integer', example: 8 },
          versionNumber: { type: 'integer', example: 2 },
          originalFileName: {
            type: 'string',
            maxLength: 255,
            example: 'planeacion-dsd2303-2026-2-v2.pdf',
          },
          mimeType: { type: 'string', example: 'application/pdf' },
          fileSizeBytes: {
            type: 'integer',
            minimum: 1,
            example: 490204,
            description: 'Calculado por el backend desde el archivo recibido.',
          },
          checksumSha256: {
            type: 'string',
            pattern: '^[0-9a-f]{64}$',
            example: '<sha256>',
            description: 'SHA-256 del contenido calculado por el backend.',
          },
          changelog: { type: 'string', nullable: true },
          uploadedBy: { type: 'integer', example: 7 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateMaterialRequest: {
        type: 'object',
        description:
          'multipart/form-data (5.5.12). authorId, currentVersion, downloadCount e isApproved los fija el backend.',
        required: [
          'subjectId',
          'academicPeriodId',
          'title',
          'materialType',
          'file',
        ],
        properties: {
          subjectId: { type: 'string', example: '3' },
          academicPeriodId: { type: 'string', example: '2' },
          title: {
            type: 'string',
            maxLength: 220,
            example: 'Planeación didáctica 2026-2',
          },
          description: { type: 'string', nullable: true },
          materialType: { type: 'string', enum: MATERIAL_TYPES },
          visibility: {
            type: 'string',
            enum: MATERIAL_VISIBILITIES,
            default: 'ESTUDIANTES_Y_DOCENTES',
          },
          syllabusChangesNote: { type: 'string', nullable: true },
          changelog: { type: 'string', nullable: true },
          file: {
            type: 'string',
            format: 'binary',
            description: 'Máximo 25 MB; PDF, Word, PowerPoint o Excel.',
          },
        },
      },
      UpdateMaterialRequest: {
        type: 'object',
        description:
          'Todos los campos son opcionales; se envía al menos uno. Nunca cambia el archivo. isApproved solo lo aplica ADMIN.',
        properties: {
          title: { type: 'string', maxLength: 220 },
          description: { type: 'string', nullable: true },
          materialType: { type: 'string', enum: MATERIAL_TYPES },
          visibility: { type: 'string', enum: MATERIAL_VISIBILITIES },
          syllabusChangesNote: { type: 'string', nullable: true },
          isApproved: { type: 'boolean' },
        },
      },
      CreateMaterialVersionRequest: {
        type: 'object',
        description:
          'multipart/form-data (5.5.14). versionNumber lo asigna el backend; las mismas reglas de archivo que en la creación.',
        required: ['file'],
        properties: {
          changelog: { type: 'string', nullable: true },
          file: {
            type: 'string',
            format: 'binary',
            description: 'Máximo 25 MB; PDF, Word, PowerPoint o Excel.',
          },
        },
      },
      DashboardSummaryResource: {
        type: 'object',
        properties: {
          currentPeriod: { ...ref('PeriodSummary'), nullable: true },
          counts: {
            type: 'object',
            properties: {
              activeCareers: { type: 'integer', example: 12 },
              activeSubjects: { type: 'integer', example: 54 },
              visibleMaterials: { type: 'integer', example: 128 },
              myAssignments: { type: 'integer', nullable: true, example: 3 },
              myMaterials: { type: 'integer', nullable: true, example: 8 },
            },
          },
          recentMaterials: {
            type: 'array',
            maxItems: 5,
            items: ref('MaterialListItem'),
          },
        },
      },
      HealthResource: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          version: { type: 'string', example: API_VERSION },
          timestamp: { type: 'string', format: 'date-time' },
          services: {
            type: 'object',
            properties: {
              database: { type: 'string', enum: ['up', 'down'] },
              cache: { type: 'string', enum: ['up', 'down'] },
              queue: { type: 'string', enum: ['up', 'down'] },
            },
          },
        },
      },
    },
  },
} as const;

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default openApiDocument;
