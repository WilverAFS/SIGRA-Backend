import { ep, pp } from './helpers.ts';

// ========================================================================= //
//                                   CONSTANTS                               //
// ========================================================================= //

const BASE = '/api/v1'; // Actualizado conforme al Capítulo 1 y 3 del Contrato API

const USERS_BASE = '/users';
const USERS = BASE + USERS_BASE;

const AUTH_BASE = '/auth';
const AUTH = BASE + AUTH_BASE;

const Paths = {
  PATH: BASE,
  
  // Módulo 1: Autenticación y Sesión (Sección 6.1 del Contrato)
  Auth: {
    PATH: AUTH_BASE,
    Register: ep(AUTH, '/register', 'POST'),
    Login: ep(AUTH, '/login', 'POST'),
    Logout: ep(AUTH, '/logout', 'POST'),
    Refresh: ep(AUTH, '/refresh', 'POST'),
    Me: ep(AUTH, '/me', 'GET'),
    ChangePassword: ep(AUTH, '/me/password', 'PATCH'),
  },

  // Módulo 2: Usuarios y Roles (Sección 6.2 del Contrato)
  Users: {
    PATH: USERS_BASE,
    Get: ep(USERS, '', 'GET'),           // GET /api/v1/users (Listar)
    Add: ep(USERS, '', 'POST'),          // POST /api/v1/users (Crear)
    GetOne: {
      ...ep(USERS, `/:id`, 'GET'),
      format: (id: string | number) => `${USERS}/${pp(id)}`,
    },
    Update: {
      ...ep(USERS, `/:id`, 'PATCH'),     // PATCH /api/v1/users/{id} (Actualización parcial)
      format: (id: string | number) => `${USERS}/${pp(id)}`,
    },
    Delete: {
      ...ep(USERS, `/:id`, 'DELETE'),    // DELETE /api/v1/users/{id} (Baja lógica)
      format: (id: string | number) => `${USERS}/${pp(id)}`,
    },
  },
} as const;

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default Paths;