import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import redis, {
  closeRedis,
  ensureRedisConnected,
} from '#src/common/infra/redis.ts';
import { hashPassword } from '#src/common/utils/password.utils.ts';
import type { AuthSessionResource } from '#src/entities/Auth/index.ts';
import type { UserResource } from '#src/entities/User/index.ts';
import { AuthMessages } from '#src/services/AuthService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import { assertError, detailFields, type OkRes } from './support/utils.ts';

const P = Paths.Auth;

useTestDatabase();

describe('Autenticación y Sesión (6.1)', () => {
  let base: BaseData;

  const validRegister = (overrides: Record<string, unknown> = {}) => ({
    institutionalId: '22161099',
    firstName: 'Sherlin',
    lastName: 'Magaña Peralta',
    email: 'sherlin@itoaxaca.edu.mx',
    password: 'ClaveSegura1!',
    role: 'ESTUDIANTE',
    instituteId: base.instituteId,
    careerId: base.careerId,
    ...overrides,
  });

  beforeEach(async () => {
    base = await resetDb();
    await ensureRedisConnected();
    await redis.flushDb();
  });

  after(async () => {
    await closeRedis();
  });

  // ------------------------------------------------------------------ //
  describe(P.Register.DISPLAY, () => {
    it('registra ESTUDIANTE activo de inmediato y devuelve AuthSessionResource', async () => {
      const res: OkRes<AuthSessionResource> = await agent
        .post(P.Register.FULL_PATH)
        .send(validRegister({ role: 'ESTUDIANTE' }));

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, AuthMessages.REGISTERED_ACTIVE);
      assert.equal(res.body.data.tokenType, 'Bearer');
      assert.equal(res.body.data.expiresIn, 3600);
      assert.ok(res.body.data.accessToken);
      assert.ok(res.body.data.refreshToken);
      assert.equal(res.body.data.user?.isActive, true);
      assert.equal(res.body.data.user?.role, 'ESTUDIANTE');
      assert.equal('passwordHash' in (res.body.data.user ?? {}), false);
    });

    it('registra DOCENTE con isActive: false y sin tokens', async () => {
      const res: OkRes<UserResource> = await agent
        .post(P.Register.FULL_PATH)
        .send(
          validRegister({
            role: 'DOCENTE',
            email: 'docente@itoaxaca.edu.mx',
            institutionalId: 'DOC-001',
          }),
        );

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, AuthMessages.REGISTERED_PENDING);
      assert.equal(res.body.data.isActive, false);
      assert.equal(res.body.data.role, 'DOCENTE');
      assert.equal('accessToken' in res.body.data, false);
      assert.equal('refreshToken' in res.body.data, false);
    });

    it('valida reglas estrictas de contraseña (8+, mayús, minús, número, símbolo) y nombres solo letras', async () => {
      const res = await agent.post(P.Register.FULL_PATH).send(
        validRegister({
          firstName: 'Ana-María',
          lastName: 'Pérez 2',
          password: 'ClaveSegura1',
        }),
      );

      const body = assertError(res, 422, ErrorCodes.VALIDATION_ERROR);
      const fields = detailFields(body);
      assert.ok(fields.includes('firstName'));
      assert.ok(fields.includes('lastName'));
      assert.ok(fields.includes('password'));
    });

    it('rechaza correo duplicado con 409 CONFLICT_UNIQUE', async () => {
      await agent.post(P.Register.FULL_PATH).send(validRegister());
      const res = await agent
        .post(P.Register.FULL_PATH)
        .send(validRegister({ institutionalId: '22161088' }));
      assertError(res, 409, ErrorCodes.CONFLICT_UNIQUE);
    });
  });

  // ------------------------------------------------------------------ //
  describe(P.Login.DISPLAY, () => {
    it('flujo completo: DOCENTE inactivo (403 AUTH_USER_INACTIVE) → ADMIN activa → login exitoso', async () => {
      const regRes: OkRes<UserResource> = await agent
        .post(P.Register.FULL_PATH)
        .send(
          validRegister({
            role: 'DOCENTE',
            email: 'profe@itoaxaca.edu.mx',
            institutionalId: 'DOC-100',
          }),
        );
      const docenteId = regRes.body.data.id;

      const failLogin = await agent.post(P.Login.FULL_PATH).send({
        email: 'profe@itoaxaca.edu.mx',
        password: 'ClaveSegura1!',
      });
      assertError(failLogin, 403, ErrorCodes.AUTH_USER_INACTIVE);

      const admin = await insertUser(base, {
        role: 'ADMIN',
        email: 'admin@itoaxaca.edu.mx',
        institutionalId: 'ADM-001',
        isActive: true,
      });
      await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: await hashPassword('AdminPass1!') },
      });

      const adminLogin: OkRes<AuthSessionResource> = await agent
        .post(P.Login.FULL_PATH)
        .send({ email: 'admin@itoaxaca.edu.mx', password: 'AdminPass1!' });
      const adminToken = adminLogin.body.data.accessToken;

      const activateRes = await agent
        .patch(Paths.Users.Update.format(docenteId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
      assert.equal(activateRes.status, 200);

      const okLogin: OkRes<AuthSessionResource> = await agent
        .post(P.Login.FULL_PATH)
        .send({
          email: 'profe@itoaxaca.edu.mx',
          password: 'ClaveSegura1!',
        });
      assert.equal(okLogin.status, 200);
      assert.ok(okLogin.body.data.accessToken);
    });

    it('aplica rate limit de 10 req/15 min por IP + email en login', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await agent.post(P.Login.FULL_PATH).send({
          email: 'limite@itoaxaca.edu.mx',
          password: 'ClaveIncorrecta1!',
        });
        assert.equal(res.status, 401);
      }

      const blocked = await agent.post(P.Login.FULL_PATH).send({
        email: 'limite@itoaxaca.edu.mx',
        password: 'ClaveIncorrecta1!',
      });
      assertError(blocked, 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
    });
  });

  // ------------------------------------------------------------------ //
  describe(`${P.Refresh.DISPLAY}, ${P.Me.DISPLAY}, ${P.ChangePassword.DISPLAY} y ${P.Logout.DISPLAY}`, () => {
    it('rota el refresh token, revoca el anterior, permite ver /me, cambiar contraseña y hacer logout', async () => {
      const regRes: OkRes<AuthSessionResource> = await agent
        .post(P.Register.FULL_PATH)
        .send(validRegister());
      const { accessToken, refreshToken } = regRes.body.data;

      const meRes: OkRes<UserResource> = await agent
        .get(P.Me.FULL_PATH)
        .set('Authorization', `Bearer ${accessToken}`);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.email, 'sherlin@itoaxaca.edu.mx');

      const refreshRes: OkRes<AuthSessionResource> = await agent
        .post(P.Refresh.FULL_PATH)
        .send({ refreshToken });
      assert.equal(refreshRes.status, 200);
      assert.ok(refreshRes.body.data.accessToken);
      assert.notEqual(refreshRes.body.data.refreshToken, refreshToken);

      const reused = await agent
        .post(P.Refresh.FULL_PATH)
        .send({ refreshToken });
      assertError(reused, 401, ErrorCodes.AUTH_TOKEN_REVOKED);

      const passRes = await agent
        .patch(P.ChangePassword.FULL_PATH)
        .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`)
        .send({
          currentPassword: 'ClaveSegura1!',
          newPassword: 'NuevaClave2#',
        });
      assert.equal(passRes.status, 200);

      const logoutRes = await agent
        .post(P.Logout.FULL_PATH)
        .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`)
        .send({ refreshToken: refreshRes.body.data.refreshToken });
      assert.equal(logoutRes.status, 200);

      const meAfterLogout = await agent
        .get(P.Me.FULL_PATH)
        .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);
      assertError(meAfterLogout, 401, ErrorCodes.AUTH_TOKEN_REVOKED);
    });
  });
});
