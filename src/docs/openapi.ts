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

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

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
