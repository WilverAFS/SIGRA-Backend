import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import redis, {
  closeRedis,
  ensureRedisConnected,
} from '#src/common/infra/redis.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { DashboardSummaryResource } from '#src/entities/Dashboard/index.ts';
import {
  DASHBOARD_CACHE_TTL_SECONDS,
  dashboardCacheKey,
} from '#src/services/DashboardService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import { assertError, type OkRes } from './support/utils.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const P = Paths.Dashboard;

const MATERIAL_KEYS = [
  'academicPeriod',
  'academicPeriodId',
  'author',
  'authorId',
  'createdAt',
  'currentVersion',
  'description',
  'downloadCount',
  'id',
  'isApproved',
  'materialType',
  'subject',
  'subjectId',
  'syllabusChangesNote',
  'title',
  'updatedAt',
  'visibility',
].sort();

type SummaryRes = OkRes<DashboardSummaryResource>;

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

useTestDatabase();

describe('Dashboard (6.10)', { concurrency: false }, () => {
  let base: BaseData;
  let tokens: { admin: string; docente: string; estudiante: string };
  let ids: { admin: number; docente: number; otroDocente: number };
  let currentPeriodId: number;
  let subjectId: number;

  const summary = (token: string): Promise<SummaryRes> =>
    agent.get(P.Summary.FULL_PATH).set('Authorization', token);

  /** Crear un material con valores por defecto. */
  const material = (data: {
    authorId: number;
    title: string;
    visibility?: string;
    isApproved?: boolean;
    deleted?: boolean;
    createdAt: string;
  }) =>
    prisma.material.create({
      data: {
        subjectId,
        authorId: data.authorId,
        academicPeriodId: currentPeriodId,
        title: data.title,
        materialType: 'PLANEACION',
        visibility: data.visibility ?? 'ESTUDIANTES_Y_DOCENTES',
        isApproved: data.isApproved ?? true,
        deletedAt: data.deleted ? new Date() : null,
        createdAt: new Date(data.createdAt),
      },
    });

  beforeEach(async () => {
    base = await resetDb();
    await ensureRedisConnected();
    await redis.flushDb();

    const admin = await insertUser(base, {
      role: 'ADMIN',
      institutionalId: 'A1',
      email: 'admin@ito.mx',
      withCareer: false,
    });
    const docente = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'D1',
      email: 'docente@ito.mx',
      firstName: 'Wilver Alfredo',
      lastName: 'Flores Santiago',
    });
    const otroDocente = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'D2',
      email: 'otro@ito.mx',
    });
    const estudiante = await insertUser(base, {
      role: 'ESTUDIANTE',
      institutionalId: 'E1',
      email: 'alumna@ito.mx',
    });
    ids = { admin: admin.id, docente: docente.id, otroDocente: otroDocente.id };
    tokens = {
      admin: `Bearer ${signAccessToken(admin.id, 'ADMIN')}`,
      docente: `Bearer ${signAccessToken(docente.id, 'DOCENTE')}`,
      estudiante: `Bearer ${signAccessToken(estudiante.id, 'ESTUDIANTE')}`,
    };

    await prisma.career.create({
      data: {
        instituteId: base.instituteId,
        curriculumCode: 'OLD',
        name: 'Carrera inactiva',
        shortName: 'OLD',
        isActive: false,
      },
    });
    const period = await prisma.academicPeriod.create({
      data: {
        code: '2026-2',
        name: 'Agosto - Diciembre 2026',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    const oldPeriod = await prisma.academicPeriod.create({
      data: {
        code: '2026-1',
        name: 'Enero - Junio 2026',
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-06-30'),
      },
    });
    currentPeriodId = period.id;
    const subject = await prisma.subject.create({
      data: {
        careerId: base.careerId,
        code: 'DSD-2303',
        name: 'Desarrollo de Servicios Web',
        semester: 9,
        totalCredits: 5,
      },
    });
    subjectId = subject.id;
    await prisma.subject.create({
      data: {
        careerId: base.careerId,
        code: 'OLD-1',
        name: 'Materia inactiva',
        semester: 1,
        totalCredits: 5,
        isActive: false,
      },
    });
    await prisma.subjectAssignment.createMany({
      data: [
        {
          subjectId,
          teacherId: docente.id,
          academicPeriodId: period.id,
          groupCode: '9SA',
        },
        {
          subjectId,
          teacherId: docente.id,
          academicPeriodId: oldPeriod.id,
          groupCode: '8SA',
        },
        {
          subjectId,
          teacherId: otroDocente.id,
          academicPeriodId: period.id,
          groupCode: '9SB',
        },
      ],
    });

    // 6 visibles para todos, 1 solo docentes, 1 sin aprobar, 1 eliminado
    for (let i = 1; i <= 6; i++) {
      await material({
        authorId: i <= 2 ? docente.id : otroDocente.id,
        title: `Material ${i}`,
        createdAt: `2026-11-0${i}T10:00:00Z`,
      });
    }
    await material({
      authorId: docente.id,
      title: 'Solo docentes',
      visibility: 'SOLO_DOCENTES',
      createdAt: '2026-11-10T10:00:00Z',
    });
    await material({
      authorId: otroDocente.id,
      title: 'Sin aprobar',
      isApproved: false,
      createdAt: '2026-11-11T10:00:00Z',
    });
    await material({
      authorId: docente.id,
      title: 'Eliminado',
      deleted: true,
      createdAt: '2026-11-12T10:00:00Z',
    });
  });

  after(async () => {
    await closeRedis();
  });

  it('responde 401 sin sesión válida', async () => {
    assertError(
      await agent.get(P.Summary.FULL_PATH),
      401,
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
    );
  });

  it('ESTUDIANTE: solo materiales aprobados y para estudiantes; myAssignments y myMaterials en null', async () => {
    const res = await summary(tokens.estudiante);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.currentPeriod, {
      id: currentPeriodId,
      code: '2026-2',
      name: 'Agosto - Diciembre 2026',
    });
    assert.deepEqual(res.body.data.counts, {
      activeCareers: 1,
      activeSubjects: 1,
      visibleMaterials: 6,
      myAssignments: null,
      myMaterials: null,
    });
    assert.deepEqual(
      res.body.data.recentMaterials.map((m) => m.title),
      ['Material 6', 'Material 5', 'Material 4', 'Material 3', 'Material 2'],
    );
  });

  it('DOCENTE: ve también los de solo docentes y cuenta sus asignaciones y materiales', async () => {
    const res = await summary(tokens.docente);
    assert.deepEqual(res.body.data.counts, {
      activeCareers: 1,
      activeSubjects: 1,
      visibleMaterials: 8,
      myAssignments: 2,
      myMaterials: 3,
    });
    assert.deepEqual(
      res.body.data.recentMaterials.map((m) => m.title),
      [
        'Sin aprobar',
        'Solo docentes',
        'Material 6',
        'Material 5',
        'Material 4',
      ],
    );
  });

  it('ADMIN: myAssignments y myMaterials son totales globales', async () => {
    const res = await summary(tokens.admin);
    assert.equal(res.body.data.counts.myAssignments, 3);
    assert.equal(res.body.data.counts.myMaterials, 8);
    assert.equal(res.body.data.counts.visibleMaterials, 8);
  });

  it('recentMaterials usa la proyección de MaterialResource sin datos sensibles del autor', async () => {
    const res = await summary(tokens.estudiante);
    const [first] = res.body.data.recentMaterials;
    assert.deepEqual(Object.keys(first).sort(), MATERIAL_KEYS);
    assert.deepEqual(Object.keys(first.author).sort(), [
      'firstName',
      'id',
      'lastName',
    ]);
    assert.deepEqual(first.subject, {
      id: subjectId,
      code: 'DSD-2303',
      name: 'Desarrollo de Servicios Web',
    });
    assert.equal(first.academicPeriod.code, '2026-2');
  });

  it('currentPeriod es null si no hay periodo vigente', async () => {
    await prisma.academicPeriod.updateMany({ data: { isCurrent: false } });
    const res = await summary(tokens.estudiante);
    assert.equal(res.body.data.currentPeriod, null);
  });

  it('cachea el resumen en Redis 60 s por usuario', async () => {
    const first = await summary(tokens.docente);
    const ttl = await redis.ttl(dashboardCacheKey(ids.docente));
    assert.ok(ttl > 0 && ttl <= DASHBOARD_CACHE_TTL_SECONDS, `TTL ${ttl}`);

    await material({
      authorId: ids.docente,
      title: 'Nuevo',
      createdAt: '2026-11-20T10:00:00Z',
    });
    const cached = await summary(tokens.docente);
    assert.deepEqual(cached.body.data, first.body.data);

    // Otro usuario no comparte el caché
    const other = await summary(
      `Bearer ${signAccessToken(ids.otroDocente, 'DOCENTE')}`,
    );
    assert.equal(other.body.data.recentMaterials[0].title, 'Nuevo');

    await redis.del(dashboardCacheKey(ids.docente));
    const fresh = await summary(tokens.docente);
    assert.equal(fresh.body.data.counts.myMaterials, 4);
  });

  it('si Redis falla al leer el caché, calcula el resumen igual', async (t) => {
    t.mock.method(redis, 'get', () => Promise.reject(new Error('Redis caído')));
    const res = await summary(tokens.admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.counts.myMaterials, 8);
  });
});
