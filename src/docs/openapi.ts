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
  404: errorResponse('404 RESOURCE_NOT_FOUND.'),
  409: errorResponse(
    '409 CONFLICT_UNIQUE: correo o institutionalId duplicado.',
  ),
  422: errorResponse('422 VALIDATION_ERROR con error.details por campo.'),
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
    { name: 'Usuarios', description: '6.2 (solo ADMIN)' },
  ],
  // Seguridad Bearer por defecto (contrato 2.1); las rutas públicas la anulan.
  security: [{ bearerAuth: [] }],
  paths: {
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
