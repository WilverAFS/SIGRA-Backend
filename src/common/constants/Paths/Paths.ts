import { ep, pp } from './helpers.ts';

// ========================================================================= //
//                                   CONSTANTS                               //
// ========================================================================= //

const BASE = '/api/v1'; // Prefijo versionado (contrato 3.1)

const USERS_BASE = '/users';
const USERS = BASE + USERS_BASE;

const AUTH_BASE = '/auth';
const AUTH = BASE + AUTH_BASE;

const userById = (id: string | number) => `${USERS}/${pp(id)}`;

const Paths = {
  PATH: BASE,

  // Salud (6.9.3) y documentación OpenAPI
  Health: ep(BASE, '/health', 'GET'),
  Docs: {
    PATH: '/docs',
    FULL_PATH: `${BASE}/docs`,
    JSON: `${BASE}/docs.json`,
  },

  // Módulo 1: Autenticación y Sesión (6.1) — pendiente (BE #5)
  Auth: {
    PATH: AUTH_BASE,
    Register: ep(AUTH, '/register', 'POST'),
    Login: ep(AUTH, '/login', 'POST'),
    Logout: ep(AUTH, '/logout', 'POST'),
    Refresh: ep(AUTH, '/refresh', 'POST'),
    Me: ep(AUTH, '/me', 'GET'),
    ChangePassword: ep(AUTH, '/me/password', 'PATCH'),
  },

  // Módulo 2: Usuarios (6.2)
  Users: {
    PATH: USERS_BASE,
    Get: ep(USERS, '', 'GET'), // 6.2.1 Listar
    Add: ep(USERS, '', 'POST'), // 6.2.2 Crear
    GetOne: { ...ep(USERS, '/:id', 'GET'), format: userById }, // 6.2.3
    Update: { ...ep(USERS, '/:id', 'PATCH'), format: userById }, // 6.2.4
    Delete: { ...ep(USERS, '/:id', 'DELETE'), format: userById }, // 6.2.5
  },
} as const;

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default Paths;
