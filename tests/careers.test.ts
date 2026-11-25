import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { CareerResource } from '#src/entities/Career/index.ts';
import { CareerMessages } from '#src/services/CareerService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import { assertError, type OkRes, type PageRes } from './support/utils.ts';

const P = Paths.Careers;

useTestDatabase();

describe('Carreras (6.4)', () => {
  let base: BaseData;
  let adminAuth: string;
  let teacherAuth: string;

  beforeEach(async () => {
    base = await resetDb();
    const admin = await insertUser(base, {
      role: 'ADMIN',
      email: 'admin-car@itoaxaca.edu.mx',
      institutionalId: 'ADM-CAR',
      isActive: true,
    });
    const teacher = await insertUser(base, {
      role: 'DOCENTE',
      email: 'doc-car@itoaxaca.edu.mx',
      institutionalId: 'DOC-CAR',
      isActive: true,
    });
    adminAuth = `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
    teacherAuth = `Bearer ${signAccessToken(teacher.id, 'DOCENTE')}`;
  });

  it('lista, crea, obtiene, actualiza y elimina una carrera sin dependencias', async () => {
    const createRes: OkRes<CareerResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        curriculumCode: 'IIND-2010-227',
        name: 'Ingeniería Industrial',
        shortName: 'II',
        totalSemesters: 9,
        instituteId: base.instituteId,
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.message, CareerMessages.CREATED);
    const createdId = createRes.body.data.id;

    // GET list filtrado por instituteId (DOCENTE permitido)
    const listRes: PageRes<CareerResource> = await agent
      .get(`${P.Get.FULL_PATH}?instituteId=${base.instituteId}`)
      .set('Authorization', teacherAuth);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.meta.total, 2);

    // GET one
    const getOneRes: OkRes<CareerResource> = await agent
      .get(P.GetOne.format(createdId))
      .set('Authorization', teacherAuth);
    assert.equal(getOneRes.status, 200);
    assert.equal(getOneRes.body.data.curriculumCode, 'IIND-2010-227');

    // PATCH (ADMIN)
    const patchRes: OkRes<CareerResource> = await agent
      .patch(P.Update.format(createdId))
      .set('Authorization', adminAuth)
      .send({ totalSemesters: 10 });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.totalSemesters, 10);

    // DELETE sin dependencias (ADMIN)
    const delRes = await agent
      .delete(P.Delete.format(createdId))
      .set('Authorization', adminAuth);
    assert.equal(delRes.status, 200);
  });

  it('responde 403 FORBIDDEN_ROLE si DOCENTE intenta crear, actualizar o eliminar', async () => {
    const postRes = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', teacherAuth)
      .send({
        curriculumCode: 'IGEM-2009-201',
        name: 'Ingeniería en Gestión Empresarial',
        shortName: 'IGE',
        instituteId: base.instituteId,
      });
    assertError(postRes, 403, ErrorCodes.FORBIDDEN_ROLE);

    const patchRes = await agent
      .patch(P.Update.format(base.careerId))
      .set('Authorization', teacherAuth)
      .send({ shortName: 'ISC2' });
    assertError(patchRes, 403, ErrorCodes.FORBIDDEN_ROLE);

    const delRes = await agent
      .delete(P.Delete.format(base.careerId))
      .set('Authorization', teacherAuth);
    assertError(delRes, 403, ErrorCodes.FORBIDDEN_ROLE);
  });

  it('responde 409 CONFLICT_UNIQUE si curriculumCode se repite en el instituto y 409 RESOURCE_HAS_DEPENDENCIES si tiene usuarios/materias', async () => {
    const existing = await agent
      .get(P.GetOne.format(base.careerId))
      .set('Authorization', adminAuth);
    const code = (existing.body as { data: CareerResource }).data.curriculumCode;

    const dupRes = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        curriculumCode: code,
        name: 'Carrera Duplicada',
        shortName: 'DUP',
        instituteId: base.instituteId,
      });
    assertError(dupRes, 409, ErrorCodes.CONFLICT_UNIQUE);

    // base.careerId ya tiene al admin/docente insertados en beforeEach
    const delWithDeps = await agent
      .delete(P.Delete.format(base.careerId))
      .set('Authorization', adminAuth);
    assertError(delWithDeps, 409, ErrorCodes.RESOURCE_HAS_DEPENDENCIES);
  });
});
