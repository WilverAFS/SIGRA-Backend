import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type { SubjectAssignmentResource } from '#src/entities/SubjectAssignment/index.ts';
import { SubjectAssignmentMessages } from '#src/services/SubjectAssignmentService.ts';

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

const P = Paths.SubjectAssignments;

useTestDatabase();

describe(
  'Asignaciones de carga académica (6.7)',
  { concurrency: false },
  () => {
    let base: BaseData;
    let adminId: number;
    let teacherAId: number;
    let teacherBId: number;
    let studentId: number;
    let inactiveTeacherId: number;
    let adminAuth: string;
    let teacherAAuth: string;
    let teacherBAuth: string;
    let studentAuth: string;
    let periodId: number;
    let subjectId: number;
    let otherSubjectId: number;

    beforeEach(async () => {
      base = await resetDb();
      const admin = await insertUser(base, {
        role: 'ADMIN',
        institutionalId: 'ADM-ASG',
        email: 'admin-asg@itoaxaca.edu.mx',
        withCareer: false,
      });
      const teacherA = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'DOC-ASG-A',
        email: 'doca-asg@itoaxaca.edu.mx',
      });
      const teacherB = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'DOC-ASG-B',
        email: 'docb-asg@itoaxaca.edu.mx',
      });
      const student = await insertUser(base, {
        role: 'ESTUDIANTE',
        institutionalId: 'EST-ASG',
        email: 'est-asg@itoaxaca.edu.mx',
      });
      const inactive = await insertUser(base, {
        role: 'DOCENTE',
        institutionalId: 'DOC-ASG-INA',
        email: 'inactivo-asg@itoaxaca.edu.mx',
        isActive: false,
      });
      adminId = admin.id;
      teacherAId = teacherA.id;
      teacherBId = teacherB.id;
      studentId = student.id;
      inactiveTeacherId = inactive.id;
      adminAuth = `Bearer ${signAccessToken(admin.id, 'ADMIN')}`;
      teacherAAuth = `Bearer ${signAccessToken(teacherA.id, 'DOCENTE')}`;
      teacherBAuth = `Bearer ${signAccessToken(teacherB.id, 'DOCENTE')}`;
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
          code: 'DSD-2303',
          name: 'Desarrollo de Servicios Web',
          semester: 8,
          creditsTheory: 2,
          creditsPractice: 3,
          totalCredits: 5,
        },
      });
      subjectId = subject.id;
      const other = await prisma.subject.create({
        data: {
          careerId: base.careerId,
          code: 'SCA-1025',
          name: 'Taller de Bases de Datos',
          semester: 5,
          creditsTheory: 1,
          creditsPractice: 3,
          totalCredits: 4,
        },
      });
      otherSubjectId = other.id;
    });

    const assignmentBody = (overrides: Record<string, unknown> = {}) => ({
      subjectId,
      teacherId: teacherAId,
      academicPeriodId: periodId,
      groupCode: '8SC',
      ...overrides,
    });

    it('6.7.2/1/3/4: crea, lista, obtiene y elimina una asignación', async () => {
      const created: OkRes<SubjectAssignmentResource> = await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', adminAuth)
        .send({
          subjectId,
          teacherId: teacherAId,
          academicPeriodId: periodId,
          groupCode: '8SC',
        });
      assert.equal(created.status, 201);
      assert.equal(created.body.message, SubjectAssignmentMessages.CREATED);
      assert.equal(created.body.data.assignedBy, adminId);
      assert.deepEqual(created.body.data.subject, {
        id: subjectId,
        code: 'DSD-2303',
        name: 'Desarrollo de Servicios Web',
      });
      assert.deepEqual(created.body.data.teacher, {
        id: teacherAId,
        firstName: 'Usuario',
        lastName: 'De Prueba',
      });
      assert.deepEqual(created.body.data.academicPeriod, {
        id: periodId,
        code: '2026-2',
        name: 'Agosto - Diciembre 2026',
      });
      const id = created.body.data.id;

      await agent.post(P.Add.FULL_PATH).set('Authorization', adminAuth).send({
        subjectId: otherSubjectId,
        teacherId: teacherBId,
        academicPeriodId: periodId,
        groupCode: '8SC',
      });

      const list: PageRes<SubjectAssignmentResource> = await agent
        .get(
          `${P.Get.FULL_PATH}?teacherId=${teacherAId}&subjectId=${subjectId}&academicPeriodId=${periodId}&groupCode=8SC&page=1&limit=1`,
        )
        .set('Authorization', adminAuth);
      assert.equal(list.status, 200);
      assert.equal(list.body.meta.total, 1);
      assert.equal(list.body.data[0].id, id);

      const one: OkRes<SubjectAssignmentResource> = await agent
        .get(P.GetOne.format(id))
        .set('Authorization', adminAuth);
      assert.equal(one.status, 200);
      assert.equal(one.body.data.teacherId, teacherAId);

      const deleted: OkRes<null> = await agent
        .delete(P.Delete.format(id))
        .set('Authorization', adminAuth);
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.data, null);
      // El borrado físico no elimina la materia ni al docente.
      assert.ok(await prisma.subject.findUnique({ where: { id: subjectId } }));
      assert.ok(await prisma.user.findUnique({ where: { id: teacherAId } }));
    });

    it('6.7.2: 409 ASSIGNMENT_DUPLICATED para la misma combinación', async () => {
      const body = assignmentBody();
      const first = await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', adminAuth)
        .send(body);
      assert.equal(first.status, 201);

      assertError(
        await agent
          .post(P.Add.FULL_PATH)
          .set('Authorization', adminAuth)
          .send(body),
        409,
        ErrorCodes.ASSIGNMENT_DUPLICATED,
      );
      // Otro grupo sí es una asignación distinta.
      const otherGroup = await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', adminAuth)
        .send({ ...body, groupCode: '9SC' });
      assert.equal(otherGroup.status, 201);
    });

    it('6.7.2: 422 si el docente no es activo, la materia o el periodo no existen', async () => {
      const cases: { body: Record<string, unknown>; field: string }[] = [
        {
          body: {
            subjectId,
            teacherId: studentId,
            academicPeriodId: periodId,
            groupCode: '8SC',
          },
          field: 'teacherId',
        },
        {
          body: {
            subjectId,
            teacherId: inactiveTeacherId,
            academicPeriodId: periodId,
            groupCode: '8SC',
          },
          field: 'teacherId',
        },
        {
          body: {
            subjectId,
            teacherId: 9999,
            academicPeriodId: periodId,
            groupCode: '8SC',
          },
          field: 'teacherId',
        },
        {
          body: {
            subjectId: 9999,
            teacherId: teacherAId,
            academicPeriodId: periodId,
            groupCode: '8SC',
          },
          field: 'subjectId',
        },
        {
          body: {
            subjectId,
            teacherId: teacherAId,
            academicPeriodId: 9999,
            groupCode: '8SC',
          },
          field: 'academicPeriodId',
        },
      ];
      for (const { body, field } of cases) {
        const res = assertError(
          await agent
            .post(P.Add.FULL_PATH)
            .set('Authorization', adminAuth)
            .send(body),
          422,
          ErrorCodes.VALIDATION_ERROR,
        );
        assert.deepEqual(detailFields(res), [field]);
      }
    });

    it('6.7.1/3: DOCENTE ve solo las suyas; ESTUDIANTE recibe 403', async () => {
      const mine = await prisma.subjectAssignment.create({
        data: {
          subjectId,
          teacherId: teacherAId,
          academicPeriodId: periodId,
          groupCode: '8SC',
        },
      });
      const other = await prisma.subjectAssignment.create({
        data: {
          subjectId,
          teacherId: teacherBId,
          academicPeriodId: periodId,
          groupCode: '8SC',
        },
      });

      // Filtro teacherId ajeno: se ignora y se fuerza el id del token
      const list: PageRes<SubjectAssignmentResource> = await agent
        .get(`${P.Get.FULL_PATH}?teacherId=${teacherBId}`)
        .set('Authorization', teacherAAuth);
      assert.equal(list.status, 200);
      assert.equal(list.body.meta.total, 1);
      assert.equal(list.body.data[0].id, mine.id);

      const own: OkRes<SubjectAssignmentResource> = await agent
        .get(P.GetOne.format(mine.id))
        .set('Authorization', teacherAAuth);
      assert.equal(own.status, 200);
      const foreign = assertError(
        await agent
          .get(P.GetOne.format(other.id))
          .set('Authorization', teacherAAuth),
        403,
        ErrorCodes.FORBIDDEN_OWNERSHIP,
      );
      assert.equal(foreign.error.code, ErrorCodes.FORBIDDEN_OWNERSHIP);

      const asStudent = await agent
        .get(P.Get.FULL_PATH)
        .set('Authorization', studentAuth);
      assertError(asStudent, 403, ErrorCodes.FORBIDDEN_ROLE);
      assertError(
        await agent
          .get(P.GetOne.format(mine.id))
          .set('Authorization', studentAuth),
        403,
        ErrorCodes.FORBIDDEN_ROLE,
      );
    });

    it('6.7.2/4: 403 para DOCENTE al crear o eliminar y 404 si no existe', async () => {
      for (const res of [
        await agent
          .post(P.Add.FULL_PATH)
          .set('Authorization', teacherAAuth)
          .send({
            subjectId,
            teacherId: teacherAId,
            academicPeriodId: periodId,
            groupCode: '8SC',
          }),
        await agent
          .delete(P.Delete.format(1))
          .set('Authorization', teacherBAuth),
      ]) {
        assertError(res, 403, ErrorCodes.FORBIDDEN_ROLE);
      }
      assertError(
        await agent.get(P.GetOne.format(9999)).set('Authorization', adminAuth),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
      assertError(
        await agent
          .delete(P.Delete.format(9999))
          .set('Authorization', adminAuth),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    });

    it('registra SUBJECT_ASSIGNMENT_CREATED y SUBJECT_ASSIGNMENT_DELETED', async () => {
      const created: OkRes<SubjectAssignmentResource> = await agent
        .post(P.Add.FULL_PATH)
        .set('Authorization', adminAuth)
        .send({
          subjectId,
          teacherId: teacherAId,
          academicPeriodId: periodId,
          groupCode: '8SC',
        });
      const id = created.body.data.id;
      await agent.delete(P.Delete.format(id)).set('Authorization', adminAuth);

      for (const [action, entityId] of [
        ['SUBJECT_ASSIGNMENT_CREATED', id],
        ['SUBJECT_ASSIGNMENT_DELETED', id],
      ] as const) {
        const [log] = await auditLogsFor(action);
        assert.ok(log, `falta evento ${action}`);
        assert.equal(log.entityName, 'subject_assignments');
        assert.equal(log.entityId, entityId);
      }
    });
  },
);
