/* eslint-disable no-process-env */
import { execSync } from 'node:child_process';
import { after, before } from 'node:test';

import prisma from '#src/common/infra/prisma.ts';
import { closeRedis } from '#src/common/infra/redis.ts';
import { hashPassword } from '#src/common/utils/password.utils.ts';
import AuditService from '#src/services/AuditService.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

export interface BaseData {
  roles: { ADMIN: number; DOCENTE: number; ESTUDIANTE: number };
  instituteId: number;
  careerId: number;
}

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

/**
 * Harness de BD para los tests de integración. Usa la base de datos de
 * `config/.env.test` (sigra_test), NUNCA la de desarrollo.
 *
 * 1. Antes de los tests de cada archivo aplica las migraciones versionadas.
 * 2. `resetDb()` vacía todas las tablas y carga los datos base mínimos.
 */
export function useTestDatabase() {
  before(() => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'DATABASE_URL de pruebas debe apuntar a una BD de test (p. ej. sigra_test).',
      );
    }
    if (process.env.TEST_SKIP_MIGRATIONS !== 'true') {
      execSync('npx prisma migrate deploy', {
        stdio: 'ignore',
        env: process.env,
      });
    }
  });
  after(async () => {
    await closeRedis();
    await prisma.$disconnect();
  });
}

/**
 * Vaciar todas las tablas (salvo el historial de migraciones) y sembrar los
 * roles, un instituto y una carrera.
 */
export async function resetDb(): Promise<BaseData> {
  // Que ningún evento de auditoría del test anterior se escriba a media limpieza
  await AuditService.drain();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename::text AS tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
    );
  }
  const [admin, docente, estudiante] = await Promise.all(
    (['ADMIN', 'DOCENTE', 'ESTUDIANTE'] as const).map((name) =>
      prisma.role.create({ data: { name, description: `Rol ${name}` } }),
    ),
  );
  const institute = await prisma.institute.create({
    data: {
      code: 'TEST-ITO',
      name: 'Instituto Tecnológico de Prueba',
      shortName: 'ITP',
      city: 'Oaxaca de Juárez',
      state: 'Oaxaca',
    },
  });
  const career = await prisma.career.create({
    data: {
      instituteId: institute.id,
      curriculumCode: 'ISIC-TEST',
      name: 'Ingeniería en Sistemas Computacionales',
      shortName: 'ISC',
    },
  });
  return {
    roles: {
      ADMIN: admin.id,
      DOCENTE: docente.id,
      ESTUDIANTE: estudiante.id,
    },
    instituteId: institute.id,
    careerId: career.id,
  };
}

/**
 * Insertar un usuario directamente en la BD para preparar escenarios.
 */
export async function insertUser(
  base: BaseData,
  data: {
    role: keyof BaseData['roles'];
    institutionalId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    isActive?: boolean;
    withCareer?: boolean;
  },
) {
  return prisma.user.create({
    data: {
      roleId: base.roles[data.role],
      instituteId: base.instituteId,
      careerId: data.withCareer === false ? null : base.careerId,
      institutionalId: data.institutionalId,
      firstName: data.firstName ?? 'Usuario',
      lastName: data.lastName ?? 'De Prueba',
      email: data.email,
      passwordHash: await hashPassword('ClaveSegura1!'),
      isActive: data.isActive ?? true,
    },
  });
}
