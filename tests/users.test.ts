import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import { verifyPassword } from '#src/common/utils/password.utils.ts';
import type { UserResource } from '#src/entities/User/index.ts';
import UserService, { UserMessages } from '#src/services/UserService.ts';

import { agent as rawAgent } from './support/agent.ts';
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

const P = Paths.Users;

const RESOURCE_KEYS = [
  'careerId',
  'createdAt',
  'email',
  'firstName',
  'id',
  'instituteId',
  'institutionalId',
  'isActive',
  'lastLoginAt',
  'lastName',
  'role',
  'roleId',
  'updatedAt',
].sort();

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

useTestDatabase();

describe('Usuarios (6.2)', { concurrency: false }, () => {
  let base: BaseData;
  let adminAuth: string;
  let adminUserId: number;

  const withAdminAuth = <
    T extends { set: (field: string, value: string) => T },
  >(
    request: T,
  ): T => request.set('Authorization', adminAuth);

  const agent = {
    get: (path: string) => withAdminAuth(rawAgent.get(path)),
    post: (path: string) => withAdminAuth(rawAgent.post(path)),
    patch: (path: string) => withAdminAuth(rawAgent.patch(path)),
    put: (path: string) => withAdminAuth(rawAgent.put(path)),
    delete: (path: string) => withAdminAuth(rawAgent.delete(path)),
  };

  const createAdminAuth = async () => {
    const admin = await insertUser(base, {
      role: 'ADMIN',
      email: `admin-${Date.now()}-${Math.random()}@itoaxaca.edu.mx`,
      institutionalId: `ADM-${Math.floor(Math.random() * 100000)}`,
      isActive: true,
    });
    adminUserId = admin.id;
    return `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
  };

  const newUser = (overrides: Record<string, unknown> = {}) => ({
    institutionalId: '22161058',
    firstName: 'Wilver Alfredo',
    lastName: 'Flores Santiago',
    email: 'usuario@itoaxaca.edu.mx',
    password: 'ClaveSegura1!',
    role: 'DOCENTE',
    instituteId: base.instituteId,
    careerId: base.careerId,
    ...overrides,
  });

  beforeEach(async () => {
    base = await resetDb();
    adminAuth = await createAdminAuth();
  });

  // ------------------------------------------------------------------ //
  describe(P.Add.DISPLAY, () => {
    it('crea el usuario, responde 201 con UserResource y guarda solo el hash', async () => {
      const res: OkRes<UserResource> = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ id: 999, createdAt: 'ignorado' }));
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, UserMessages.CREATED);
      assert.deepEqual(Object.keys(res.body.data).sort(), RESOURCE_KEYS);
      assert.equal(res.body.data.role, 'DOCENTE');
      assert.equal(res.body.data.roleId, base.roles.DOCENTE);
      assert.equal(res.body.data.lastLoginAt, null);
      assert.notEqual(res.body.data.id, 999);
      const saved = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      assert.notEqual(saved.passwordHash, 'ClaveSegura1!');
      assert.equal(
        await verifyPassword('ClaveSegura1!', saved.passwordHash),
        true,
      );
    });

    it('permite crear un ADMIN sin carrera', async () => {
      const res: OkRes<UserResource> = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ role: 'ADMIN', careerId: undefined }));
      assert.equal(res.status, 201);
      assert.equal(res.body.data.careerId, null);
    });

    it('responde 422 con el detalle de cada campo inválido', async () => {
      const usersBefore = await prisma.user.count();
      const res = await agent.post(P.Add.FULL_PATH).send({
        firstName: 'Ana-María',
        lastName: 'López 2',
        email: 'no-es-correo',
        password: 'ClaveSegura1',
        role: 'SUPERUSUARIO',
        instituteId: 'uno',
      });
      const body = assertError(res, 422, ErrorCodes.VALIDATION_ERROR);
      const fields = detailFields(body);
      for (const field of [
        'institutionalId',
        'firstName',
        'lastName',
        'email',
        'password',
        'role',
        'instituteId',
      ]) {
        assert.ok(fields.includes(field), `falta el detalle de ${field}`);
      }
      assert.equal(await prisma.user.count(), usersBefore);
    });

    it('responde 422 si falta la carrera en un DOCENTE', async () => {
      const res = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ careerId: undefined }));
      const body = assertError(res, 422, ErrorCodes.VALIDATION_ERROR);
      assert.deepEqual(detailFields(body), ['careerId']);
    });

    it('responde 422 si el instituto o la carrera no existen', async () => {
      const noInstitute = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ instituteId: 9999 }));
      assert.deepEqual(
        detailFields(
          assertError(noInstitute, 422, ErrorCodes.VALIDATION_ERROR),
        ),
        ['instituteId'],
      );
      const noCareer = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ careerId: 9999 }));
      assert.deepEqual(
        detailFields(assertError(noCareer, 422, ErrorCodes.VALIDATION_ERROR)),
        ['careerId'],
      );
    });

    it('responde 409 CONFLICT_UNIQUE si el correo ya existe (sin importar mayúsculas)', async () => {
      await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'X1',
        email: 'usuario@itoaxaca.edu.mx',
      });
      const res = await agent
        .post(P.Add.FULL_PATH)
        .send(newUser({ email: 'USUARIO@itoaxaca.edu.mx' }));
      const body = assertError(res, 409, ErrorCodes.CONFLICT_UNIQUE);
      assert.deepEqual(detailFields(body), ['email']);
    });

    it('responde 409 CONFLICT_UNIQUE si el institutionalId se repite en el instituto', async () => {
      await insertUser(base, {
        role: 'ESTUDIANTE',
        institutionalId: '22161058',
        email: 'otro@itoaxaca.edu.mx',
      });
      const res = await agent.post(P.Add.FULL_PATH).send(newUser());
      const body = assertError(res, 409, ErrorCodes.CONFLICT_UNIQUE);
      assert.deepEqual(detailFields(body), ['institutionalId']);
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.Get.DISPLAY, () => {
    beforeEach(async () => {
      const people = [
        ['ADMIN', 'A1', 'admin@ito.mx', 'Laura', 'Zárate'],
        ['DOCENTE', 'D1', 'docente@ito.mx', 'Pedro', 'Bautista'],
        ['ESTUDIANTE', 'E1', 'alumna@ito.mx', 'Kelly', 'Cruz Alonso'],
      ] as const;
      for (const [
        role,
        institutionalId,
        email,
        firstName,
        lastName,
      ] of people) {
        await insertUser(base, {
          role,
          institutionalId,
          email,
          firstName,
          lastName,
        });
      }
      await insertUser(base, {
        role: 'ESTUDIANTE',
        institutionalId: 'E2',
        email: 'baja@ito.mx',
        lastName: 'Eliminado',
      });
      await prisma.user.update({
        where: { email: 'baja@ito.mx' },
        data: { deletedAt: new Date() },
      });
    });

    it('lista paginada con meta y links, ordenada por lastName y sin bajas lógicas', async () => {
      const res: PageRes<UserResource> = await agent.get(P.Get.FULL_PATH);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.data.map((u) => u.lastName),
        ['Bautista', 'Cruz Alonso', 'De Prueba', 'Zárate'],
      );
      assert.deepEqual(res.body.meta, {
        total: 4,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      assert.equal(res.body.links.self, '/api/v1/users?page=1&limit=20');
      assert.equal(res.body.links.next, null);
      assert.equal(res.body.links.prev, null);
    });

    it('pagina con next y prev conservando los filtros', async () => {
      const first: PageRes<UserResource> = await agent.get(
        `${P.Get.FULL_PATH}?limit=2&sort=createdAt:desc`,
      );
      assert.equal(first.body.data.length, 2);
      assert.equal(first.body.meta.totalPages, 2);
      assert.equal(
        first.body.links.next,
        '/api/v1/users?limit=2&sort=createdAt%3Adesc&page=2',
      );
      const second: PageRes<UserResource> = await agent.get(
        first.body.links.next,
      );
      assert.equal(second.body.data.length, 2);
      assert.equal(second.body.links.next, null);
      assert.notEqual(second.body.links.prev, null);
    });

    it('ajusta limit a 100 si se pide más', async () => {
      const res: PageRes<UserResource> = await agent.get(
        `${P.Get.FULL_PATH}?limit=500`,
      );
      assert.equal(res.body.meta.limit, 100);
    });

    it('filtra por rol, isActive y search; ignora filtros desconocidos', async () => {
      const byRole: PageRes<UserResource> = await agent.get(
        `${P.Get.FULL_PATH}?role=DOCENTE&desconocido=1`,
      );
      assert.deepEqual(
        byRole.body.data.map((u) => u.email),
        ['docente@ito.mx'],
      );
      const bySearch: PageRes<UserResource> = await agent.get(
        `${P.Get.FULL_PATH}?search=kelly&isActive=true`,
      );
      assert.deepEqual(
        bySearch.body.data.map((u) => u.email),
        ['alumna@ito.mx'],
      );
    });

    it('responde 422 ante sort, page o filtros con valores inválidos', async () => {
      for (const query of [
        'sort=email:asc',
        'page=0',
        'role=ROOT',
        'isActive=si',
      ]) {
        const res = await agent.get(`${P.Get.FULL_PATH}?${query}`);
        assertError(res, 422, ErrorCodes.VALIDATION_ERROR);
      }
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.GetOne.DISPLAY, () => {
    it('devuelve el UserResource', async () => {
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
      });
      const res: OkRes<UserResource> = await agent.get(
        P.GetOne.format(user.id),
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.email, 'docente@ito.mx');
      assert.deepEqual(Object.keys(res.body.data).sort(), RESOURCE_KEYS);
    });

    it('responde 404 si no existe o tuvo baja lógica', async () => {
      assertError(
        await agent.get(P.GetOne.format(9999)),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });
      assertError(
        await agent.get(P.GetOne.format(user.id)),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    });

    it('responde 422 si el id no es un entero positivo', async () => {
      assertError(
        await agent.get(P.GetOne.format('abc')),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.Update.DISPLAY, () => {
    it('actualiza solo los campos enviados con PATCH', async () => {
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
        isActive: false,
      });
      const res: OkRes<UserResource> = await agent
        .patch(P.Update.format(user.id))
        .send({ firstName: 'Pedro', isActive: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.message, UserMessages.UPDATED);
      assert.equal(res.body.data.firstName, 'Pedro');
      assert.equal(res.body.data.isActive, true);
      assert.equal(res.body.data.lastName, 'De Prueba');
      assert.equal(res.body.data.email, 'docente@ito.mx');
    });

    it('cambia el rol resolviendo el roleId', async () => {
      const user = await insertUser(base, {
        role: 'ESTUDIANTE',
        institutionalId: 'E1',
        email: 'alumno@ito.mx',
      });
      const res: OkRes<UserResource> = await agent
        .patch(P.Update.format(user.id))
        .send({ role: 'DOCENTE' });
      assert.equal(res.body.data.role, 'DOCENTE');
      assert.equal(res.body.data.roleId, base.roles.DOCENTE);
    });

    it('ya no acepta PUT', async () => {
      const res = await agent.put(P.Update.format(1)).send({ firstName: 'X' });
      assertError(res, 404, ErrorCodes.RESOURCE_NOT_FOUND);
    });

    it('responde 422 si el cuerpo está vacío o un campo es inválido', async () => {
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
      });
      assertError(
        await agent.patch(P.Update.format(user.id)).send({}),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
      const invalid = await agent
        .patch(P.Update.format(user.id))
        .send({ lastName: "D'Angelo" });
      assert.deepEqual(
        detailFields(assertError(invalid, 422, ErrorCodes.VALIDATION_ERROR)),
        ['lastName'],
      );
    });

    it('responde 422 si deja sin carrera a un usuario que no es ADMIN', async () => {
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
      });
      const res = await agent
        .patch(P.Update.format(user.id))
        .send({ careerId: null });
      assert.deepEqual(
        detailFields(assertError(res, 422, ErrorCodes.VALIDATION_ERROR)),
        ['careerId'],
      );
    });

    it('responde 409 si el correo pasa a duplicarse y permite conservar el propio', async () => {
      await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'uno@ito.mx',
      });
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D2',
        email: 'dos@ito.mx',
      });
      assertError(
        await agent
          .patch(P.Update.format(user.id))
          .send({ email: 'uno@ito.mx' }),
        409,
        ErrorCodes.CONFLICT_UNIQUE,
      );
      const same = await agent
        .patch(P.Update.format(user.id))
        .send({ email: 'dos@ito.mx' });
      assert.equal(same.status, 200);
    });

    it('responde 404 si el usuario no existe', async () => {
      assertError(
        await agent.patch(P.Update.format(9999)).send({ firstName: 'Ana' }),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.Delete.DISPLAY, () => {
    it('hace baja lógica: 200 con data null y deja de aparecer', async () => {
      const user = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'D1',
        email: 'docente@ito.mx',
      });
      const res: OkRes<null> = await agent.delete(P.Delete.format(user.id));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        success: true,
        message: UserMessages.DELETED,
        data: null,
      });
      const saved = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      assert.notEqual(saved.deletedAt, null);
      assertError(
        await agent.get(P.GetOne.format(user.id)),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
      // Idempotencia (3.5): el segundo intento devuelve 404
      assertError(
        await agent.delete(P.Delete.format(user.id)),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    });

    it('no deja el sistema sin administradores activos (409)', async () => {
      const otherAdmin = await insertUser(base, {
        role: 'ADMIN',
        institutionalId: 'A1',
        email: 'admin@ito.mx',
        withCareer: false,
      });
      const res = await agent.delete(P.Delete.format(otherAdmin.id));
      assert.equal(res.status, 200);
      assertError(
        await agent.delete(P.Delete.format(adminUserId)),
        409,
        ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
      );
    });
  });

  // ------------------------------------------------------------------ //
  describe('errores inesperados', () => {
    it('responden 500 INTERNAL_ERROR sin exponer detalles', async (t) => {
      t.mock.method(UserService, 'list', () =>
        Promise.reject(new Error('boom')),
      );
      const res = await agent.get(P.Get.FULL_PATH);
      const body = assertError(res, 500, ErrorCodes.INTERNAL_ERROR);
      assert.equal(JSON.stringify(body).includes('boom'), false);
    });
  });
});
