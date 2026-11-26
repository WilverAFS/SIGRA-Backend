import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { SubjectResource } from '#src/entities/Subject/index.ts';
import { SubjectMessages } from '#src/services/SubjectService.ts';

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

const P = Paths.Subjects;

useTestDatabase();

describe('Materias (6.6)', { concurrency: false }, () => {
  let base: BaseData;
  let adminAuth: string;
  let teacherAuth: string;
  let studentAuth: string;
  let teacherId: number;
  let periodId: number;
  let subjectId: number;

  const validSubject = {
    careerId: 0,
    code: 'DSD-2303',
    name: 'Desarrollo de Servicios Web',
    semester: 8,
    creditsTheory: 2,
    creditsPractice: 3,
    syllabusSummary: 'Arquitecturas REST/SOAP y autenticación JWT.',
  };

  beforeEach(async () => {
    base = await resetDb();
    const admin = await insertUser(base, {
      role: 'ADMIN',
      institutionalId: 'ADM-SUB',
      email: 'admin-sub@itoaxaca.edu.mx',
      withCareer: false,
    });
    const teacher = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'DOC-SUB',
      email: 'doc-sub@itoaxaca.edu.mx',
    });
    const student = await insertUser(base, {
      role: 'ESTUDIANTE',
      institutionalId: 'EST-SUB',
      email: 'est-sub@itoaxaca.edu.mx',
    });
    teacherId = teacher.id;
    adminAuth = `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
    teacherAuth = `Bearer ${signAccessToken(teacher.id, 'DOCENTE')}`;
    studentAuth = `Bearer ${signAccessToken(student.id, 'ESTUDIANTE')}`;

    const period = await prisma.academicPeriod.create({
      data: {
        code: '2026-2',
        name: 'Agosto - Diciembre 2026',
        startDate: new Date('2026-08-24T00:00:00.000Z'),
        endDate: new Date('2026-12-11T00:00:00.000Z'),
        isCurrent: true,
      },
    });
    periodId = period.id;
    const subject = await prisma.subject.create({
      data: {
        careerId: base.careerId,
        code: 'ISC-101',
        name: 'Introducción a la Programación',
        semester: 1,
        creditsTheory: 2,
        creditsPractice: 3,
        totalCredits: 5,
      },
    });
    subjectId = subject.id;
  });

  it('6.6.1/2/3/4/5: lista, crea, obtiene, actualiza y elimina una materia', async () => {
    const created: OkRes<SubjectResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({ ...validSubject, careerId: base.careerId });
    assert.equal(created.status, 201);
    assert.equal(created.body.message, SubjectMessages.CREATED);
    assert.equal(created.body.data.totalCredits, 5);
    assert.equal(created.body.data.isActive, true);
    assert.equal(
      created.body.data.syllabusSummary,
      validSubject.syllabusSummary,
    );
    const newId = created.body.data.id;

    // Listado con search por nombre, filtros y orden (DOCENTE permitido)
    const list: PageRes<SubjectResource> = await agent
      .get(
        `${P.Get.FULL_PATH}?careerId=${base.careerId}&semester=8&isActive=true&search=servicios&sort=name:asc&limit=1`,
      )
      .set('Authorization', teacherAuth);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data.map((s) => s.code),
      ['DSD-2303'],
    );
    assert.equal(list.body.meta.total, 1);
    assert.equal(list.body.data[0].totalCredits, 5);

    const one: OkRes<SubjectResource> = await agent
      .get(P.GetOne.format(newId))
      .set('Authorization', studentAuth);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.code, 'DSD-2303');

    const patched: OkRes<SubjectResource> = await agent
      .patch(P.Update.format(newId))
      .set('Authorization', adminAuth)
      .send({ creditsPractice: 4, syllabusSummary: null });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.totalCredits, 6);
    assert.equal(patched.body.data.syllabusSummary, null);

    const deleted: OkRes<null> = await agent
      .delete(P.Delete.format(newId))
      .set('Authorization', adminAuth);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data, null);
  });

  it('6.6.1: paginación y filtros isActive/semester/search', async () => {
    await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        ...validSubject,
        code: 'DSD-2304',
        name: 'Servicios Web Avanzados',
        careerId: base.careerId,
      });

    const active: PageRes<SubjectResource> = await agent
      .get(`${P.Get.FULL_PATH}?isActive=true&sort=semester:desc&limit=1&page=2`)
      .set('Authorization', teacherAuth);
    assert.equal(active.status, 200);
    assert.equal(active.body.meta.total, 2);
    assert.equal(active.body.meta.totalPages, 2);
    assert.equal(active.body.data[0].semester, 1);

    await agent
      .patch(P.Update.format(subjectId))
      .set('Authorization', adminAuth)
      .send({ isActive: false });
    const inactive: PageRes<SubjectResource> = await agent
      .get(`${P.Get.FULL_PATH}?isActive=false&search=programación`)
      .set('Authorization', studentAuth);
    assert.equal(inactive.body.meta.total, 1);
    assert.equal(inactive.body.data[0].id, subjectId);

    const byCode: PageRes<SubjectResource> = await agent
      .get(`${P.Get.FULL_PATH}?search=DSD-2304`)
      .set('Authorization', teacherAuth);
    assert.deepEqual(
      byCode.body.data.map((s) => s.code),
      ['DSD-2304'],
    );
  });

  it('6.6.2/4: code es único por carrera y totalCredits es solo lectura', async () => {
    const first = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({ ...validSubject, careerId: base.careerId });
    assert.equal(first.status, 201);

    const duplicate = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        ...validSubject,
        careerId: base.careerId,
        name: 'Materia repetida',
      });
    const error = assertError(duplicate, 409, ErrorCodes.CONFLICT_UNIQUE);
    assert.deepEqual(detailFields(error), ['code']);

    assertError(
      await agent
        .patch(P.Update.format(subjectId))
        .set('Authorization', adminAuth)
        .send({ code: 'DSD-2303' }),
      409,
      ErrorCodes.CONFLICT_UNIQUE,
    );

    // El mismo código en otra carrera sí es válido (uq_subjects_career_code)
    const otherCareer = await prisma.career.create({
      data: {
        instituteId: base.instituteId,
        curriculumCode: 'IIND-2010',
        name: 'Ingeniería Industrial',
        shortName: 'II',
      },
    });
    const inOtherCareer = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({ ...validSubject, careerId: otherCareer.id });
    assert.equal(inOtherCareer.status, 201);

    // totalCredits enviado por el cliente se ignora: siempre se recalcula
    const recalculated: OkRes<SubjectResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({
        ...validSubject,
        careerId: base.careerId,
        code: 'DSD-9999',
        totalCredits: 99,
      });
    assert.equal(recalculated.status, 201);
    assert.equal(recalculated.body.data.totalCredits, 5);
    await agent
      .patch(P.Update.format(recalculated.body.data.id))
      .set('Authorization', adminAuth)
      .send({ creditsTheory: 4, totalCredits: 99 });
    assert.equal(
      (
        await prisma.subject.findUnique({
          where: { id: recalculated.body.data.id },
        })
      )?.totalCredits,
      7,
    );
  });

  it('6.6: 422 ante datos inválidos, 403 para no ADMIN y 404 si no existe', async () => {
    for (const invalid of [
      { ...validSubject, careerId: base.careerId, semester: 13 },
      { ...validSubject, careerId: base.careerId, creditsTheory: -1 },
      { ...validSubject, careerId: 9999 },
      { ...validSubject, careerId: base.careerId, code: '' },
    ]) {
      assertError(
        await agent
          .post(P.Add.FULL_PATH)
          .set('Authorization', adminAuth)
          .send(invalid),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    assertError(
      await agent
        .patch(P.Update.format(subjectId))
        .set('Authorization', adminAuth)
        .send({}),
      422,
      ErrorCodes.VALIDATION_ERROR,
    );

    for (const res of [
      await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', teacherAuth)
        .send({
          ...validSubject,
          careerId: base.careerId,
        }),
      await agent
        .patch(P.Update.format(subjectId))
        .set('Authorization', studentAuth)
        .send({ name: 'Otro nombre' }),
      await agent
        .delete(P.Delete.format(subjectId))
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
      await agent.delete(P.Delete.format(9999)).set('Authorization', adminAuth),
    ]) {
      assertError(res, 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
  });

  it('6.6.5: 409 RESOURCE_HAS_DEPENDENCIES con asignaciones o materiales', async () => {
    await prisma.subjectAssignment.create({
      data: {
        subjectId,
        teacherId,
        academicPeriodId: periodId,
        groupCode: '8SC',
      },
    });
    assertError(
      await agent
        .delete(P.Delete.format(subjectId))
        .set('Authorization', adminAuth),
      409,
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
    );

    await prisma.subjectAssignment.deleteMany({ where: { subjectId } });
    await prisma.material.create({
      data: {
        subjectId,
        authorId: teacherId,
        academicPeriodId: periodId,
        title: 'Temario',
        materialType: 'TEMARIO',
      },
    });
    assertError(
      await agent
        .delete(P.Delete.format(subjectId))
        .set('Authorization', adminAuth),
      409,
      ErrorCodes.RESOURCE_HAS_DEPENDENCIES,
    );
  });

  it('registra SUBJECT_CREATED, SUBJECT_UPDATED y SUBJECT_DELETED en la bitácora', async () => {
    const created: OkRes<SubjectResource> = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .send({ ...validSubject, careerId: base.careerId });
    const id = created.body.data.id;
    await agent
      .patch(P.Update.format(id))
      .set('Authorization', adminAuth)
      .send({ name: 'Desarrollo de Servicios Web II' });
    await agent.delete(P.Delete.format(id)).set('Authorization', adminAuth);

    for (const [action, entityId] of [
      ['SUBJECT_CREATED', id],
      ['SUBJECT_UPDATED', id],
      ['SUBJECT_DELETED', id],
    ] as const) {
      const [log] = await auditLogsFor(action);
      assert.ok(log, `falta evento ${action}`);
      assert.equal(log.entityName, 'subjects');
      assert.equal(log.entityId, entityId);
    }
  });
});
