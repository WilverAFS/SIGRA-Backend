import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import redis, { ensureRedisConnected } from '#src/common/infra/redis.ts';
import type { AuthSessionResource } from '#src/entities/Auth/index.ts';
import type { RoleResource } from '#src/entities/Role/index.ts';

import { agent } from './support/agent.ts';
import { type BaseData, resetDb, useTestDatabase } from './support/db.ts';
import { assertError, type OkRes } from './support/utils.ts';

const P = Paths.Roles;

useTestDatabase();

describe('Roles (6.2.6–6.2.7) y RBAC (2.3)', () => {
  let base: BaseData;

  beforeEach(async () => {
    base = await resetDb();
    await ensureRedisConnected();
    await redis.flushDb();
  });

  it('lista y obtiene roles para un ESTUDIANTE autenticado, pero bloquea /users con 403 FORBIDDEN_ROLE', async () => {
    const reg: OkRes<AuthSessionResource> = await agent
      .post(Paths.Auth.Register.FULL_PATH)
      .send({
        institutionalId: '22161077',
        firstName: 'Carlos',
        lastName: 'Ruiz',
        email: 'carlos@itoaxaca.edu.mx',
        password: 'ClaveSegura1!',
        role: 'ESTUDIANTE',
        instituteId: base.instituteId,
        careerId: base.careerId,
      });
    const token = reg.body.data.accessToken;

    // GET /roles
    const listRes: OkRes<RoleResource[]> = await agent
      .get(P.Get.FULL_PATH)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.length, 3);

    // GET /roles/:id
    const oneRes: OkRes<RoleResource> = await agent
      .get(P.GetOne.format(base.roles.ADMIN))
      .set('Authorization', `Bearer ${token}`);
    assert.equal(oneRes.status, 200);
    assert.equal(oneRes.body.data.name, 'ADMIN');

    // GET /roles/9999 → 404
    const notFound = await agent
      .get(P.GetOne.format(9999))
      .set('Authorization', `Bearer ${token}`);
    assertError(notFound, 404, ErrorCodes.RESOURCE_NOT_FOUND);

    // RBAC: ESTUDIANTE no puede entrar a /users (solo ADMIN)
    const forbidden = await agent
      .get(Paths.Users.Get.FULL_PATH)
      .set('Authorization', `Bearer ${token}`);
    assertError(forbidden, 403, ErrorCodes.FORBIDDEN_ROLE);
  });
});
