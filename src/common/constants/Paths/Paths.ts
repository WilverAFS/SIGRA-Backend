import { ep, pp } from './helpers.ts';

// ========================================================================= //
//                                   CONSTANTS                               //
// ========================================================================= //

const BASE = '/api/v1'; // Prefijo versionado (contrato 3.1)

const USERS_BASE = '/users';
const USERS = BASE + USERS_BASE;

const AUTH_BASE = '/auth';
const AUTH = BASE + AUTH_BASE;

const ROLES_BASE = '/roles';
const ROLES = BASE + ROLES_BASE;
const roleById = (id: string | number) => `${ROLES}/${pp(id)}`;

const userById = (id: string | number) => `${USERS}/${pp(id)}`;

const INSTITUTES_BASE = '/institutes';
const INSTITUTES = BASE + INSTITUTES_BASE;
const instituteById = (id: string | number) => `${INSTITUTES}/${pp(id)}`;

const CAREERS_BASE = '/careers';
const CAREERS = BASE + CAREERS_BASE;
const careerById = (id: string | number) => `${CAREERS}/${pp(id)}`;

const ACADEMIC_PERIODS_BASE = '/academic-periods';
const ACADEMIC_PERIODS = BASE + ACADEMIC_PERIODS_BASE;
const academicPeriodById = (id: string | number) =>
  `${ACADEMIC_PERIODS}/${pp(id)}`;
const setCurrentPeriod = (id: string | number) =>
  `${academicPeriodById(id)}/set-current`;

const SUBJECTS_BASE = '/subjects';
const SUBJECTS = BASE + SUBJECTS_BASE;
const subjectById = (id: string | number) => `${SUBJECTS}/${pp(id)}`;

const SUBJECT_ASSIGNMENTS_BASE = '/subject-assignments';
const SUBJECT_ASSIGNMENTS = BASE + SUBJECT_ASSIGNMENTS_BASE;
const subjectAssignmentById = (id: string | number) =>
  `${SUBJECT_ASSIGNMENTS}/${pp(id)}`;

const AUDIT_BASE = '/audit-logs';
const AUDIT = BASE + AUDIT_BASE;
const auditLogById = (id: string | number) => `${AUDIT}/${pp(id)}`;

const DASHBOARD_BASE = '/dashboard';
const DASHBOARD = BASE + DASHBOARD_BASE;

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

  // Módulo 2: Roles (6.2.6–6.2.7)
  Roles: {
    PATH: ROLES_BASE,
    Get: ep(ROLES, '', 'GET'), // 6.2.6 Listar
    GetOne: { ...ep(ROLES, '/:id', 'GET'), format: roleById }, // 6.2.7 Obtener
  },

  // Módulo 3: Institutos (6.3)
  Institutes: {
    PATH: INSTITUTES_BASE,
    Get: ep(INSTITUTES, '', 'GET'),
    Add: ep(INSTITUTES, '', 'POST'),
    GetOne: { ...ep(INSTITUTES, '/:id', 'GET'), format: instituteById },
    Update: { ...ep(INSTITUTES, '/:id', 'PATCH'), format: instituteById },
    Delete: { ...ep(INSTITUTES, '/:id', 'DELETE'), format: instituteById },
  },

  // Módulo 4: Carreras (6.4)
  Careers: {
    PATH: CAREERS_BASE,
    Get: ep(CAREERS, '', 'GET'),
    Add: ep(CAREERS, '', 'POST'),
    GetOne: { ...ep(CAREERS, '/:id', 'GET'), format: careerById },
    Update: { ...ep(CAREERS, '/:id', 'PATCH'), format: careerById },
    Delete: { ...ep(CAREERS, '/:id', 'DELETE'), format: careerById },
  },

  // Módulo 5: Periodos académicos (6.5)
  AcademicPeriods: {
    PATH: ACADEMIC_PERIODS_BASE,
    Get: ep(ACADEMIC_PERIODS, '', 'GET'), // 6.5.1 Listar
    Add: ep(ACADEMIC_PERIODS, '', 'POST'), // 6.5.2 Crear
    Current: ep(ACADEMIC_PERIODS, '/current', 'GET'), // 6.5.3 Vigente
    GetOne: {
      ...ep(ACADEMIC_PERIODS, '/:id', 'GET'),
      format: academicPeriodById,
    }, // 6.5.4
    Update: {
      ...ep(ACADEMIC_PERIODS, '/:id', 'PATCH'),
      format: academicPeriodById,
    }, // 6.5.5
    SetCurrent: {
      ...ep(ACADEMIC_PERIODS, '/:id/set-current', 'PATCH'),
      format: setCurrentPeriod,
    }, // 6.5.6
    Delete: {
      ...ep(ACADEMIC_PERIODS, '/:id', 'DELETE'),
      format: academicPeriodById,
    }, // 6.5.7
  },

  // Módulo 6: Materias (6.6)
  Subjects: {
    PATH: SUBJECTS_BASE,
    Get: ep(SUBJECTS, '', 'GET'), // 6.6.1 Listar
    Add: ep(SUBJECTS, '', 'POST'), // 6.6.2 Crear
    GetOne: { ...ep(SUBJECTS, '/:id', 'GET'), format: subjectById }, // 6.6.3
    Update: { ...ep(SUBJECTS, '/:id', 'PATCH'), format: subjectById }, // 6.6.4
    Delete: { ...ep(SUBJECTS, '/:id', 'DELETE'), format: subjectById }, // 6.6.5
  },

  // Módulo 7: Asignaciones de carga académica (6.7)
  SubjectAssignments: {
    PATH: SUBJECT_ASSIGNMENTS_BASE,
    Get: ep(SUBJECT_ASSIGNMENTS, '', 'GET'), // 6.7.1 Listar
    Add: ep(SUBJECT_ASSIGNMENTS, '', 'POST'), // 6.7.2 Crear
    GetOne: {
      ...ep(SUBJECT_ASSIGNMENTS, '/:id', 'GET'),
      format: subjectAssignmentById,
    }, // 6.7.3
    Delete: {
      ...ep(SUBJECT_ASSIGNMENTS, '/:id', 'DELETE'),
      format: subjectAssignmentById,
    }, // 6.7.4
  },

  // Módulo 9: Auditoría (6.9.1–6.9.2)
  AuditLogs: {
    PATH: AUDIT_BASE,
    Get: ep(AUDIT, '', 'GET'), // 6.9.1 Listar
    GetOne: { ...ep(AUDIT, '/:id', 'GET'), format: auditLogById }, // 6.9.2
  },

  // Módulo 10: Dashboard (6.10)
  Dashboard: {
    PATH: DASHBOARD_BASE,
    Summary: ep(DASHBOARD, '/summary', 'GET'), // 6.10.1
  },
} as const;

// ========================================================================= //
//                                    EXPORT                                 //
// ========================================================================= //

export default Paths;
