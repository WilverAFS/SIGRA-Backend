import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { AcademicPeriodResource } from '#src/entities/AcademicPeriod/index.ts';
import { AcademicPeriodMessages } from '#src/services/AcademicPeriodService.ts';

import { agent } from './support/agent.ts';
import {
  type BaseData,
  insertUser,
  resetDb,
  useTestDatabase,
} from './support/db.ts';
import {
  assertError,
  auditLogsFor,
  detailFields,
  type OkRes,
  type PageRes,
} from './support/utils.ts';

const P = Paths.AcademicPeriods;

useTestDatabase();

describe('Periodos académicos (6.5)', { concurrency: false }, () => {
  let base: BaseData;
  let adminAuth: string;
  let teacherAuth: string;
  let studentAuth: string;
  let teacherId: number;
  let previousId: number;
  let currentId: number;

  beforeEach(async () => {
    base = await resetDb();
    const admin = await insertUser(base, {
      role: 'ADMIN',
      institutionalId: 'ADM-PER',
      email: 'admin-per@itoaxaca.edu.mx',
      withCareer: false,
    });
    const teacher = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'DOC-PER',
      email: 'doc-per@itoaxaca.edu.mx',
    });
    const student = await insertUser(base, {
      role: 'ESTUDIANTE',
      institutionalId: 'EST-PER',
      email: 'est-per@itoaxaca.edu.mx',
    });
    teacherId = teacher.id;
    adminAuth = `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
    teacherAuth = `Bearer ${signAccessToken(teacher.id, 'DOCENTE')}`;
    studentAuth = `Bearer ${signAccessToken(student.id, 'ESTUDIANTE')}`;

    const previous = await prisma.academicPeriod.create({
      data: {
        code: '2026-1',
        name: 'Enero - Junio 2026',
        startDate: new Date('2026-01-26T00:00:00.000Z'),
        endDate: new Date('2026-06-12T00:00:00.000Z'),
      },
    });
    const current = await prisma.academicPeriod.create({
      data: {
        code: '2026-2',
        name: 'Agosto - Diciembre 2026',
        startDate: new Date('2026-08-24T00:00:00.000Z'),
        endDate: new Date('2026-12-11T00:00:00.000Z'),
        isCurrent: true,
      },
    });
    previousId = previous.id;
    currentId = current.id;
  });

  it('6.5.1/2/4/5/7: lista, crea, obtiene, actualiza y elimina un periodo', async () => {
    // Listado paginado con filtro isCurrent y fechas AAAA-MM-DD (ESTUDIANTE)
    const list: PageRes<AcademicPeriodResource> = await agent
      .get(
        `${P.Get.FULL_PATH}?page=1&limit=1&isCurrent=false&sort=startDate:asc`,
      )
      .set('Authorization', studentAuth);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, previousId);
    assert.equal(list.body.data[0].startDate, '2026-01-26');
    assert.equal(list.body.data[0].endDate, '2026-06-12');
    assert.deepEqual(list.body.meta, {
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    });
    assert.match(list.body.links.self, /page=1/);

    // POST: isCurrent se ignora aunque el cliente lo envíe
    const created: OkRes<AcademicPeriodResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        code: '2027-1',
        name: 'Enero - Junio 2027',
        startDate: '2027-01-25',
        endDate: '2027-06-11',
        isCurrent: true,
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.message, AcademicPeriodMessages.CREATED);
    assert.equal(created.body.data.isCurrent, false);
    assert.equal(created.body.data.startDate, '2027-01-25');
    assert.match(created.body.data.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    const newId = created.body.data.id;

    // GET /{id}
    const one: OkRes<AcademicPeriodResource> = await agent
      .get(P.GetOne.format(newId))
      .set('Authorization', teacherAuth);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.code, '2027-1');

    // PATCH parcial: isCurrent tampoco se puede cambiar aquí
    const patched: OkRes<AcademicPeriodResource> = await agent
      .patch(P.Update.format(newId))
      .set('Authorization', adminAuth)
      .send({ name: 'Enero - Junio 2027 (revisado)', isCurrent: true });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.name, 'Enero - Junio 2027 (revisado)');
    assert.equal(patched.body.data.isCurrent, false);

    // DELETE sin dependencias
    const deleted: OkRes<null> = await agent
      .delete(P.Delete.format(newId))
      .set('Authorization', adminAuth);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data, null);
    assert.equal(await prisma.academicPeriod.count(), 2);
  });

  it('6.5.3/6: get current y set-current desmarca el anterior en transacción', async () => {
    const current: OkRes<AcademicPeriodResource> = await agent
      .get(P.Current.FULL_PATH)
      .set('Authorization', studentAuth);
    assert.equal(current.status, 200);
    assert.equal(current.body.data.id, currentId);

    const set: OkRes<AcademicPeriodResource> = await agent
      .patch(P.SetCurrent.format(previousId))
      .set('Authorization', adminAuth);
    assert.equal(set.status, 200);
    assert.equal(set.body.data.id, previousId);
    assert.equal(set.body.data.isCurrent, true);
    assert.equal(
      await prisma.academicPeriod.count({ where: { isCurrent: true } }),
      1,
    );
    assert.equal(
      (await prisma.academicPeriod.findUnique({ where: { id: currentId } }))
        ?.isCurrent,
      false,
    );

    // El mismo periodo ya vigente → 409 PERIOD_ALREADY_CURRENT
    assertError(
      await agent
        .patch(P.SetCurrent.format(previousId))
        .set('Authorization', adminAuth),
      409,
      ErrorCodes.PERIOD_ALREADY_CURRENT,
    );
  });

  it('6.5.3: responde 404 si ningún periodo está fijado como vigente', async () => {
    await prisma.academicPeriod.updateMany({ data: { isCurrent: false } });
    assertError(
      await agent.get(P.Current.FULL_PATH).set('Authorization', teacherAuth),
      404,
      ErrorCodes.RESOURCE_NOT_FOUND,
    );
  });

  it('6.5.2/5: unicidad de code y 422 si endDate no es posterior a startDate', async () => {
    const body = {
      code: '2026-1',
      name: 'Periodo duplicado',
      startDate: '2026-01-26',
      endDate: '2026-06-12',
    };
    const duplicate = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send(body);
    const error = assertError(duplicate, 409, ErrorCodes.CONFLICT_UNIQUE);
    assert.deepEqual(detailFields(error), ['code']);

    assertError(
      await agent
        .patch(P.Update.format(currentId))
        .set('Authorization', adminAuth)
        .send({ code: '2026-1' }),
      409,
      ErrorCodes.CONFLICT_UNIQUE,
    );

    for (const dates of [
      { startDate: '2026-06-12', endDate: '2026-06-12' },
      { startDate: '2026-07-01', endDate: '2026-06-01' },
      { startDate: '2026-02-30', endDate: '2026-06-01' },
      { startDate: '2026/06/01', endDate: '2026-06-12' },
    ]) {
      assertError(
        await agent
          .post(P.Add.FULL_PATH)
          .set('Authorization', adminAuth)
          .send({ ...body, code: '2028-1', ...dates }),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    // La validación de fechas también se aplica al PATCH con valores fusionados
    assertError(
      await agent
        .patch(P.Update.format(previousId))
        .set('Authorization', adminAuth)
        .send({ endDate: '2025-01-01' }),
      422,
      ErrorCodes.VALIDATION_ERROR,
    );
  });

  it('6.5.7: 409 RESOURCE_HAS_DEPENDENCIES si tiene asignaciones o materiales', async () => {
    const subject = await prisma.subject.create({
      data: {
        careerId: base.careerId,
        code: 'PER-101',
        name: 'Materia de prueba',
        semester: 1,
        creditsTheory: 2,
        creditsPractice: 3,
        totalCredits: 5,
      },
    });
    await prisma.subjectAssignment.create({
      data: {
        subjectId: subject.id,
        teacherId,
        academicPeriodId: previousId,
        groupCode: '8SC',
      },
    });
    assertError(
      await agent
        .delete(P.Delete.format(previousId))
        .set('Authorization', adminAuth),
      409,
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
    );

    await prisma.subjectAssignment.deleteMany({
      where: { academicPeriodId: previousId },
    });
    await prisma.material.create({
      data: {
        subjectId: subject.id,
        authorId: teacherId,
        academicPeriodId: previousId,
        title: 'Planeación',
        materialType: 'PLANEACION',
      },
    });
    assertError(
      await agent
        .delete(P.Delete.format(previousId))
        .set('Authorization', adminAuth),
      409,
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
    );
  });

  it('6.5: 403 para DOCENTE en mutaciones y 404 en recursos inexistentes', async () => {
    for (const res of [
      await agent.post(P.Add.FULL_PATH).set('Authorization', teacherAuth).send({
        code: '2029-1',
        name: 'Periodo nuevo',
        startDate: '2029-01-01',
        endDate: '2029-06-01',
      }),
      await agent
        .patch(P.Update.format(currentId))
        .set('Authorization', teacherAuth)
        .send({ name: 'Otro nombre' }),
      await agent
        .patch(P.SetCurrent.format(previousId))
        .set('Authorization', teacherAuth),
      await agent
        .delete(P.Delete.format(currentId))
        .set('Authorization', teacherAuth),
    ]) {
      assertError(res, 403, ErrorCodes.FORBIDDEN_ROLE);
    }
    for (const res of [
      await agent.get(P.GetOne.format(9999)).set('Authorization', adminAuth),
      await agent
        .patch(P.Update.format(9999))
        .set('Authorization', adminAuth)
        .send({ name: 'Cualquiera' }),
      await agent
        .patch(P.SetCurrent.format(9999))
        .set('Authorization', adminAuth),
      await agent.delete(P.Delete.format(9999)).set('Authorization', adminAuth),
    ]) {
      assertError(res, 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
  });

  it('registra CREATED, UPDATED, DELETED y SET_CURRENT en la bitácora', async () => {
    const created: OkRes<AcademicPeriodResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        code: '2030-1',
        name: 'Enero - Junio 2030',
        startDate: '2030-01-25',
        endDate: '2030-06-11',
      });
    const id = created.body.data.id;

    await agent
      .patch(P.Update.format(id))
      .set('Authorization', adminAuth)
      .send({ name: 'Enero - Junio 2030 revisado' });
    await agent
      .delete(P.Delete.format(previousId))
      .set('Authorization', adminAuth);
    await agent.patch(P.SetCurrent.format(id)).set('Authorization', adminAuth);

    for (const [action, entityId] of [
      ['ACADEMIC_PERIOD_CREATED', id],
      ['ACADEMIC_PERIOD_UPDATED', id],
      ['ACADEMIC_PERIOD_DELETED', previousId],
      ['ACADEMIC_PERIOD_SET_CURRENT', id],
    ] as const) {
      const [log] = await auditLogsFor(action);
      assert.ok(log, `falta evento ${action}`);
      assert.equal(log.entityName, 'academic_periods');
      assert.equal(log.entityId, entityId);
    }
  });
});
