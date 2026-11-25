import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { Env } from '#src/common/constants/env.constants.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import redis, {
  closeRedis,
  ensureRedisConnected,
} from '#src/common/infra/redis.ts';
import { entityFromPath } from '#src/common/middleware/audit-trail.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import {
  AuditActions,
  type AuditEvent,
  type AuditLogResource,
  sanitizeMetadata,
} from '#src/entities/AuditLog/index.ts';
import AuditLogRepo from '#src/repos/AuditLogRepo.ts';
import AuditService from '#src/services/AuditService.ts';
import HealthService from '#src/services/HealthService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import {
  assertError,
  detailFields,
  type OkRes,
  type PageRes,
} from './support/utils.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const P = Paths.AuditLogs;

const RESOURCE_KEYS = [
  'action',
  'createdAt',
  'entityId',
  'entityName',
  'id',
  'metadata',
  'userId',
].sort();

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  userId: null,
  action: AuditActions.USER_CREATED,
  entityName: 'users',
  entityId: 1,
  metadata: null,
  occurredAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

useTestDatabase();

describe('Auditoría (6.9)', { concurrency: false }, () => {
  let base: BaseData;
  let adminId: number;
  let admin: string;
  let docente: string;

  beforeEach(async () => {
    base = await resetDb();
    await ensureRedisConnected();
    await redis.flushDb();
    const adminUser = await insertUser(base, {
      role: 'ADMIN',
      institutionalId: 'A1',
      email: 'admin@ito.mx',
      withCareer: false,
    });
    const docenteUser = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'D1',
      email: 'docente@ito.mx',
    });
    adminId = adminUser.id;
    admin = `Bearer ${signAccessToken(adminUser.id, 'ADMIN')}`;
    docente = `Bearer ${signAccessToken(docenteUser.id, 'DOCENTE')}`;
  });

  after(async () => {
    await closeRedis();
  });

  // ------------------------------------------------------------------ //
  describe('acceso', () => {
    it('responde 401 sin token', async () => {
      assertError(
        await agent.get(P.Get.FULL_PATH),
        401,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
      );
    });

    it('responde 403 FORBIDDEN_ROLE si el rol no es ADMIN', async () => {
      assertError(
        await agent.get(P.Get.FULL_PATH).set('Authorization', docente),
        403,
        ErrorCodes.FORBIDDEN_ROLE,
      );
      assertError(
        await agent.get(P.GetOne.format(1)).set('Authorization', docente),
        403,
        ErrorCodes.FORBIDDEN_ROLE,
      );
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.Get.DISPLAY, () => {
    beforeEach(async () => {
      await AuditLogRepo.create(
        event({ occurredAt: '2026-11-20T10:00:00.000Z', entityId: 1 }),
      );
      await AuditLogRepo.create(
        event({
          userId: adminId,
          action: AuditActions.USER_DELETED,
          occurredAt: '2026-11-22T10:00:00.000Z',
          entityId: 2,
        }),
      );
      await AuditLogRepo.create(
        event({
          userId: adminId,
          action: AuditActions.MATERIAL_UPLOADED,
          entityName: 'materials',
          occurredAt: '2026-11-21T10:00:00.000Z',
          entityId: 8,
          metadata: { materialType: 'PLANEACION', versionNumber: 1 },
        }),
      );
    });

    it('lista paginada, más recientes primero, con AuditLogResource', async () => {
      const res: PageRes<AuditLogResource> = await agent
        .get(`${P.Get.FULL_PATH}?sort=createdAt:asc`)
        .set('Authorization', admin);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.data.map((log) => log.createdAt),
        [
          '2026-11-22T10:00:00.000Z',
          '2026-11-21T10:00:00.000Z',
          '2026-11-20T10:00:00.000Z',
        ],
      );
      assert.deepEqual(Object.keys(res.body.data[0]).sort(), RESOURCE_KEYS);
      assert.equal(typeof res.body.data[0].id, 'number');
      assert.deepEqual(res.body.meta, {
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filtra por userId, action, entityName y entityId', async () => {
      const cases: [string, number[]][] = [
        [`userId=${adminId}`, [2, 8]],
        [`action=${AuditActions.USER_DELETED}`, [2]],
        ['entityName=materials', [8]],
        ['entityId=1', [1]],
        ['entityName=users&entityId=8', []],
      ];
      for (const [query, entityIds] of cases) {
        const res: PageRes<AuditLogResource> = await agent
          .get(`${P.Get.FULL_PATH}?${query}`)
          .set('Authorization', admin);
        assert.deepEqual(
          res.body.data.map((log) => log.entityId),
          entityIds,
          query,
        );
      }
    });

    it('filtra por rango de fechas from y to (inclusivo)', async () => {
      const res: PageRes<AuditLogResource> = await agent
        .get(
          `${P.Get.FULL_PATH}?from=2026-11-21T00:00:00Z&to=2026-11-22T10:00:00Z`,
        )
        .set('Authorization', admin);
      assert.deepEqual(
        res.body.data.map((log) => log.entityId),
        [2, 8],
      );
      const onlyFrom: PageRes<AuditLogResource> = await agent
        .get(`${P.Get.FULL_PATH}?from=2026-11-22`)
        .set('Authorization', admin);
      assert.deepEqual(
        onlyFrom.body.data.map((log) => log.entityId),
        [2],
      );
    });

    it('responde 422 con fechas inválidas o to anterior a from', async () => {
      const invalid = await agent
        .get(`${P.Get.FULL_PATH}?from=ayer`)
        .set('Authorization', admin);
      assert.deepEqual(
        detailFields(assertError(invalid, 422, ErrorCodes.VALIDATION_ERROR)),
        ['from'],
      );
      const reversed = await agent
        .get(`${P.Get.FULL_PATH}?from=2026-11-22&to=2026-11-20`)
        .set('Authorization', admin);
      assert.deepEqual(
        detailFields(assertError(reversed, 422, ErrorCodes.VALIDATION_ERROR)),
        ['to'],
      );
      assertError(
        await agent
          .get(`${P.Get.FULL_PATH}?userId=abc`)
          .set('Authorization', admin),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.GetOne.DISPLAY, () => {
    it('devuelve el evento completo con su metadata', async () => {
      const log = await AuditLogRepo.create(
        event({
          userId: adminId,
          metadata: { materialType: 'PLANEACION', versionNumber: 1 },
        }),
      );
      const res: OkRes<AuditLogResource> = await agent
        .get(P.GetOne.format(Number(log.id)))
        .set('Authorization', admin);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, {
        id: Number(log.id),
        userId: adminId,
        action: AuditActions.USER_CREATED,
        entityName: 'users',
        entityId: 1,
        metadata: { materialType: 'PLANEACION', versionNumber: 1 },
        createdAt: '2026-11-20T10:00:00.000Z',
      });
    });

    it('responde 404 si no existe y 422 si el id no es válido', async () => {
      assertError(
        await agent.get(P.GetOne.format(9999)).set('Authorization', admin),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
      for (const id of ['abc', '0', '99999999999999999999']) {
        assertError(
          await agent.get(P.GetOne.format(id)).set('Authorization', admin),
          422,
          ErrorCodes.VALIDATION_ERROR,
        );
      }
    });
  });

  // ------------------------------------------------------------------ //
  describe('middleware de bitácora (mutaciones)', () => {
    /**
     * El evento se registra al terminar la respuesta (y en producción viaja
     * por RabbitMQ), así que se espera a que aparezca.
     */
    const logsFor = async (action: string, expected = 1) => {
      for (let i = 0; i < 40; i++) {
        const logs = await prisma.auditLog.findMany({
          where: { action },
          orderBy: { id: 'asc' },
        });
        if (logs.length >= expected) return logs;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return prisma.auditLog.findMany({ where: { action } });
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

    it('deriva entidad y acción de la ruta', () => {
      assert.deepEqual(entityFromPath('/api/v1/users/3'), {
        entityName: 'users',
        actionPrefix: 'USER',
      });
      assert.deepEqual(
        entityFromPath('/api/v1/academic-periods/2/set-current'),
        {
          entityName: 'academic_periods',
          actionPrefix: 'ACADEMIC_PERIOD',
        },
      );
      assert.equal(entityFromPath('/api/v1'), null);
    });

    it('USER_CREATED, USER_UPDATED y USER_DELETED al administrar usuarios', async () => {
      const created = await agent
        .post(Paths.Users.Add.FULL_PATH)
        .set('Authorization', admin)
        .send({
          institutionalId: '22161058',
          firstName: 'Ana',
          lastName: 'López',
          email: 'ana@ito.mx',
          password: 'ClaveSegura1!',
          role: 'ESTUDIANTE',
          instituteId: base.instituteId,
          careerId: base.careerId,
        });
      assert.equal(created.status, 201);
      const userId = (created.body as { data: { id: number } }).data.id;

      const [createdLog] = await logsFor(AuditActions.USER_CREATED);
      assert.equal(createdLog.userId, adminId);
      assert.equal(createdLog.entityName, 'users');
      assert.equal(createdLog.entityId, userId);
      const metadata = createdLog.metadata as Record<string, unknown>;
      assert.equal(metadata.method, 'POST');
      assert.equal(metadata.path, '/api/v1/users');
      assert.ok(metadata.ip, 'falta la IP en metadata');
      assert.equal(JSON.stringify(metadata).includes('ClaveSegura1!'), false);

      await agent
        .patch(Paths.Users.Update.format(userId))
        .set('Authorization', admin)
        .send({ firstName: 'Ana María', isActive: false });
      const [updatedLog] = await logsFor(AuditActions.USER_UPDATED);
      assert.deepEqual(
        (updatedLog.metadata as { changedFields: string[] }).changedFields,
        ['firstName', 'isActive'],
      );

      await agent
        .delete(Paths.Users.Delete.format(userId))
        .set('Authorization', admin);
      const [deletedLog] = await logsFor(AuditActions.USER_DELETED);
      assert.equal(deletedLog.entityId, userId);
      assert.equal(deletedLog.userId, adminId);
    });

    it('no registra lecturas, operaciones fallidas ni sesiones', async () => {
      const failed = await agent
        .post(Paths.Users.Add.FULL_PATH)
        .set('Authorization', admin)
        .send({ firstName: 'Ana' });
      assert.equal(failed.status, 422);
      await agent.get(Paths.Users.Get.FULL_PATH).set('Authorization', admin);
      await agent
        .post(Paths.Auth.Login.FULL_PATH)
        .send({ email: 'admin@ito.mx', password: 'ClaveSegura1!' });
      await settle();
      assert.equal(await prisma.auditLog.count(), 0);
    });

    it('USER_REGISTERED en el autorregistro, con el propio usuario como actor', async () => {
      const res = await agent.post(Paths.Auth.Register.FULL_PATH).send({
        institutionalId: '22161099',
        firstName: 'Sherlin',
        lastName: 'Magaña Peralta',
        email: 'sherlin@itoaxaca.edu.mx',
        password: 'ClaveSegura1!',
        role: 'ESTUDIANTE',
        instituteId: base.instituteId,
        careerId: base.careerId,
      });
      assert.equal(res.status, 201);
      const [log] = await logsFor(AuditActions.USER_REGISTERED);
      assert.ok(log);
      assert.equal(log.userId, log.entityId);
      assert.equal(JSON.stringify(log.metadata).includes('Token'), false);
    });
  });

  // ------------------------------------------------------------------ //
  describe('AuditService (cola y persistencia)', () => {
    it('sanitizeMetadata quita contraseñas, hashes y tokens, también anidados', () => {
      assert.deepEqual(
        sanitizeMetadata({
          email: 'a@b.mx',
          password: 'x',
          passwordHash: 'y',
          nested: { accessToken: 'z', keep: 1 },
          list: [{ refreshToken: 'w', ok: true }],
        }),
        { email: 'a@b.mx', nested: { keep: 1 }, list: [{ ok: true }] },
      );
      assert.equal(sanitizeMetadata(undefined), null);
    });

    it('processMessage guarda un mensaje válido y descarta uno corrupto', async () => {
      const valid = Buffer.from(
        JSON.stringify(event({ metadata: { password: 'x', ok: 1 } })),
      );
      assert.equal(await AuditService.processMessage(valid), 'stored');
      const [log] = await prisma.auditLog.findMany();
      assert.deepEqual(log.metadata, { ok: 1 });
      assert.equal(log.createdAt.toISOString(), '2026-11-20T10:00:00.000Z');

      for (const raw of [
        'no-json',
        '{"action":"X"}',
        JSON.stringify(event({ action: '' })),
      ]) {
        assert.equal(
          await AuditService.processMessage(Buffer.from(raw)),
          'discarded',
        );
      }
      assert.equal(await prisma.auditLog.count(), 1);
    });

    it('guarda el evento con userId null si el usuario ya no existe', async () => {
      await AuditService.processMessage(
        Buffer.from(JSON.stringify(event({ userId: 999999 }))),
      );
      const [log] = await prisma.auditLog.findMany();
      assert.equal(log.userId, null);
    });

    it('en modo asíncrono publica en la cola y, si RabbitMQ falla, guarda directo', async (t) => {
      const env = Env as { AUDIT_ASYNC: boolean };
      env.AUDIT_ASYNC = true;
      t.after(() => {
        env.AUDIT_ASYNC = false;
      });

      const published = t.mock.method(AuditService, 'publish', () =>
        Promise.resolve(),
      );
      await AuditService.record({ userId: adminId }, 'TEST', 'users', 1);
      assert.equal(published.mock.callCount(), 1);
      assert.equal(await prisma.auditLog.count(), 0);

      published.mock.mockImplementation(() =>
        Promise.reject(new Error('RabbitMQ caído')),
      );
      await AuditService.record({ userId: adminId }, 'TEST', 'users', 1);
      assert.equal(await prisma.auditLog.count(), 1);
    });

    it('de punta a punta: el evento viaja por RabbitMQ y el consumidor lo guarda', async (t) => {
      if ((await HealthService.checkQueue()) === 'down') {
        t.skip('RabbitMQ no está disponible en este entorno');
        return;
      }
      t.after(() => AuditService.stopConsumer());
      await AuditService.startConsumer();
      await AuditService.publish(
        event({ userId: adminId, action: 'E2E_RABBITMQ', entityId: 77 }),
      );
      let log = null;
      for (let i = 0; i < 100 && !log; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        log = await prisma.auditLog.findFirst({
          where: { action: 'E2E_RABBITMQ' },
        });
      }
      assert.ok(log, 'el consumidor no guardó el evento');
      assert.equal(log.userId, adminId);
      assert.equal(log.entityId, 77);
    });

    it('record nunca lanza aunque falle la BD', async (t) => {
      t.mock.method(AuditService, 'persist', () =>
        Promise.reject(new Error('BD caída')),
      );
      await assert.doesNotReject(
        AuditService.record({ userId: null }, 'TEST', 'users', null),
      );
    });
  });
});
