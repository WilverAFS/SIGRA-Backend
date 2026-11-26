import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { InstituteResource } from '#src/entities/Institute/index.ts';
import { InstituteMessages } from '#src/services/InstituteService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import { assertError, type OkRes, type PageRes } from './support/utils.ts';

const P = Paths.Institutes;

useTestDatabase();

describe('Institutos (6.3)', () => {
  let base: BaseData;
  let adminAuth: string;
  let studentAuth: string;

  beforeEach(async () => {
    base = await resetDb();
    const admin = await insertUser(base, {
      role: 'ADMIN',
      email: 'admin-inst@itoaxaca.edu.mx',
      institutionalId: 'ADM-INST',
      isActive: true,
    });
    const student = await insertUser(base, {
      role: 'ESTUDIANTE',
      email: 'est-inst@itoaxaca.edu.mx',
      institutionalId: 'EST-INST',
      isActive: true,
    });
    adminAuth = `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
    studentAuth = `Bearer ${signAccessToken(student.id, 'ESTUDIANTE')}`;
  });

  it('lista, crea, obtiene, actualiza y elimina un instituto sin dependencias', async () => {
    // POST (ADMIN)
    const createRes: OkRes<InstituteResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        code: 'ITV',
        name: 'Instituto Tecnológico del Valle de Oaxaca',
        shortName: 'ITVO',
        city: 'Santa Cruz Xoxocotlán',
        state: 'Oaxaca',
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.message, InstituteMessages.CREATED);
    const createdId = createRes.body.data.id;

    // GET list (ESTUDIANTE permitido)
    const listRes: PageRes<InstituteResource> = await agent
      .get(P.Get.FULL_PATH)
      .set('Authorization', studentAuth);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.meta.total, 2);

    // GET one
    const getOneRes: OkRes<InstituteResource> = await agent
      .get(P.GetOne.format(createdId))
      .set('Authorization', studentAuth);
    assert.equal(getOneRes.status, 200);
    assert.equal(getOneRes.body.data.code, 'ITV');

    // PATCH (ADMIN)
    const patchRes: OkRes<InstituteResource> = await agent
      .patch(P.Update.format(createdId))
      .set('Authorization', adminAuth)
      .send({ city: 'Xoxocotlán' });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.city, 'Xoxocotlán');

    // DELETE sin dependencias (ADMIN)
    const delRes = await agent
      .delete(P.Delete.format(createdId))
      .set('Authorization', adminAuth);
    assert.equal(delRes.status, 200);
  });

  it('responde 403 FORBIDDEN_ROLE si ESTUDIANTE intenta crear, actualizar o eliminar', async () => {
    const postRes = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', studentAuth)
      .send({
        code: 'IT2',
        name: 'Otro Instituto',
        shortName: 'IT2',
        city: 'Oaxaca',
        state: 'Oaxaca',
      });
    assertError(postRes, 403, ErrorCodes.FORBIDDEN_ROLE);

    const patchRes = await agent
      .patch(P.Update.format(base.instituteId))
      .set('Authorization', studentAuth)
      .send({ city: 'Oaxaca' });
    assertError(patchRes, 403, ErrorCodes.FORBIDDEN_ROLE);

    const delRes = await agent
      .delete(P.Delete.format(base.instituteId))
      .set('Authorization', studentAuth);
    assertError(delRes, 403, ErrorCodes.FORBIDDEN_ROLE);
  });

  it('responde 404 en GET/PATCH/DELETE de instituto inexistente y 422 ante datos inválidos', async () => {
    assertError(
      await agent.get(P.GetOne.format(9999)).set('Authorization', adminAuth),
      404,
      ErrorCodes.RESOURCE_NOT_FOUND,
    );
    assertError(
      await agent
        .patch(P.Update.format(9999))
        .set('Authorization', adminAuth)
        .send({ city: 'Oaxaca' }),
      404,
      ErrorCodes.RESOURCE_NOT_FOUND,
    );
    assertError(
      await agent.delete(P.Delete.format(9999)).set('Authorization', adminAuth),
      404,
      ErrorCodes.RESOURCE_NOT_FOUND,
    );
    assertError(
      await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', adminAuth)
        .send({ code: '' }),
      422,
      ErrorCodes.VALIDATION_ERROR,
    );
  });

  it('responde 409 CONFLICT_UNIQUE si code se repite y 409 RESOURCE_HAS_DEPENDENCIES al eliminar instituto con carreras/usuarios', async () => {
    const dupRes = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        code: 'ITO',
        name: 'Duplicado',
        shortName: 'DUP',
        city: 'Oaxaca',
        state: 'Oaxaca',
      });
    assertError(dupRes, 409, ErrorCodes.CONFLICT_UNIQUE);

    const delWithDeps = await agent
      .delete(P.Delete.format(base.instituteId))
      .set('Authorization', adminAuth);
    assertError(delWithDeps, 409, ErrorCodes.RESOURCE_HAS_DEPENDENCIES);
  });
});
