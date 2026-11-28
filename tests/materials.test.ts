import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import type { Response } from 'supertest';

import { Env } from '#src/common/constants/env.constants.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import prisma from '#src/common/infra/prisma.ts';
import { signAccessToken } from '#src/common/utils/jwt.utils.ts';
import type {
  MaterialDetailResource,
  MaterialResource,
} from '#src/entities/Material/index.ts';
import type { MaterialVersionResource } from '#src/entities/MaterialVersion/index.ts';
import { MaterialMessages } from '#src/services/MaterialService.ts';

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
  type OkRes,
  type PageRes,
} from './support/utils.ts';

const P = Paths.Materials;

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
const PDF_V2 = Buffer.from(
  '%PDF-1.5\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
const CHECKSUM_PDF = createHash('sha256').update(PDF).digest('hex');

useTestDatabase();

after(async () => {
  await rm(resolve(process.cwd(), Env.UPLOAD_DIR), {
    recursive: true,
    force: true,
  });
});

/** Supertest no parsea binarios: conservamos los bytes para compararlos. */
function binaryParser(
  res: Response,
  callback: (error: Error | null, body?: unknown) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    if (res.headers['content-type']?.startsWith('application/json')) {
      try {
        callback(null, JSON.parse(buffer.toString('utf8')) as unknown);
        return;
      } catch {
        // Se conserva como Buffer para que la aserción muestre el contenido.
      }
    }
    callback(null, buffer);
  });
  res.on('error', callback);
}

function binaryGet(path: string, auth: string) {
  return agent
    .get(path)
    .set('Authorization', auth)
    .buffer(true)
    .parse(binaryParser);
}

function noStoragePath(payload: unknown) {
  assert.ok(
    !JSON.stringify(payload).includes('storagePath'),
    'storagePath no debe exponerse en ninguna respuesta',
  );
}

describe('Materiales y versiones (6.8)', { concurrency: false }, () => {
  let base: BaseData;
  let adminId: number;
  let teacherAId: number;
  let teacherBId: number;
  let adminAuth: string;
  let teacherAAuth: string;
  let teacherBAuth: string;
  let studentAuth: string;
  let periodId: number;
  let subjectId: number;

  beforeEach(async () => {
    base = await resetDb();
    const admin = await insertUser(base, {
      role: 'ADMIN',
      institutionalId: 'ADM-MAT',
      email: 'admin-mat@itoaxaca.edu.mx',
      withCareer: false,
    });
    const teacherA = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'DOC-MAT-A',
      email: 'doca-mat@itoaxaca.edu.mx',
    });
    const teacherB = await insertUser(base, {
      role: 'DOCENTE',
      institutionalId: 'DOC-MAT-B',
      email: 'docb-mat@itoaxaca.edu.mx',
    });
    const student = await insertUser(base, {
      role: 'ESTUDIANTE',
      institutionalId: 'EST-MAT',
      email: 'est-mat@itoaxaca.edu.mx',
    });
    adminId = admin.id;
    teacherAId = teacherA.id;
    teacherBId = teacherB.id;
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
    await prisma.subject.create({
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
    await prisma.subjectAssignment.create({
      data: {
        subjectId,
        teacherId: teacherAId,
        academicPeriodId: periodId,
        groupCode: '8SC',
      },
    });
  });

  const assign = (teacherId = teacherBId, targetSubjectId = subjectId) =>
    prisma.subjectAssignment.create({
      data: {
        subjectId: targetSubjectId,
        teacherId,
        academicPeriodId: periodId,
        groupCode: '9SC',
      },
    });

  type MaterialFields = {
    subjectId?: number;
    academicPeriodId?: number;
    title?: string;
    description?: string;
    materialType?: string;
    visibility?: string;
    syllabusChangesNote?: string;
    changelog?: string;
    file?: Buffer;
    filename?: string;
    contentType?: string;
  };

  function postMaterial(
    auth: string,
    fields: MaterialFields = {},
  ): Promise<OkRes<MaterialDetailResource>> {
    return agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', auth)
      .field('subjectId', String(fields.subjectId ?? subjectId))
      .field('academicPeriodId', String(fields.academicPeriodId ?? periodId))
      .field('title', fields.title ?? 'Planeación didáctica 2026-2')
      .field('description', fields.description ?? 'Planeación por unidades.')
      .field('materialType', fields.materialType ?? 'PLANEACION')
      .field('visibility', fields.visibility ?? 'ESTUDIANTES_Y_DOCENTES')
      .field(
        'syllabusChangesNote',
        fields.syllabusChangesNote ?? 'Se agrega la unidad de colas.',
      )
      .field('changelog', fields.changelog ?? 'Versión inicial.')
      .attach('file', fields.file ?? PDF, {
        filename: fields.filename ?? 'planeacion.pdf',
        contentType: fields.contentType ?? 'application/pdf',
      });
  }

  function postVersion(
    auth: string,
    id: number,
    fields: { changelog?: string; file?: Buffer } = {},
  ): Promise<OkRes<MaterialVersionResource>> {
    return agent
      .post(P.AddVersion.format(id))
      .set('Authorization', auth)
      .field('changelog', fields.changelog ?? 'Se corrige la ponderación.')
      .attach('file', fields.file ?? PDF_V2, {
        filename: 'planeacion-v2.pdf',
        contentType: 'application/pdf',
      });
  }

  it('6.8.2/1/3/4/5: crea, lista, obtiene, actualiza y elimina un material', async () => {
    const created: OkRes<MaterialDetailResource> =
      await postMaterial(teacherAAuth);
    assert.equal(created.status, 201);
    assert.equal(created.body.message, MaterialMessages.CREATED);
    assert.equal(created.body.data.authorId, teacherAId);
    assert.equal(created.body.data.currentVersion, 1);
    assert.equal(created.body.data.currentVersionDetail.versionNumber, 1);
    assert.equal(
      created.body.data.currentVersionDetail.checksumSha256,
      CHECKSUM_PDF,
    );
    assert.equal(
      created.body.data.currentVersionDetail.fileSizeBytes,
      PDF.length,
    );
    assert.deepEqual(created.body.data.author, {
      id: teacherAId,
      firstName: 'Usuario',
      lastName: 'De Prueba',
    });
    assert.deepEqual(created.body.data.subject, {
      id: subjectId,
      code: 'DSD-2303',
      name: 'Desarrollo de Servicios Web',
    });
    noStoragePath(created.body);
    const id = created.body.data.id;

    const list: PageRes<MaterialResource> = await agent
      .get(P.Get.FULL_PATH)
      .set('Authorization', adminAuth);
    assert.equal(list.status, 200);
    assert.equal(list.body.meta.total, 1);
    assert.equal(
      Object.hasOwn(list.body.data[0], 'currentVersionDetail'),
      false,
    );
    noStoragePath(list.body);

    const one: OkRes<MaterialDetailResource> = await agent
      .get(P.GetOne.format(id))
      .set('Authorization', adminAuth);
    assert.equal(one.status, 200);
    assert.equal(
      one.body.data.currentVersionDetail.checksumSha256,
      CHECKSUM_PDF,
    );

    // isApproved lo ignora el autor docente.
    const asTeacher: OkRes<MaterialResource> = await agent
      .patch(P.Update.format(id))
      .set('Authorization', teacherAAuth)
      .send({ title: 'Planeación didáctica revisada', isApproved: false });
    assert.equal(asTeacher.status, 200);
    assert.equal(asTeacher.body.data.isApproved, true);
    assert.equal(asTeacher.body.data.title, 'Planeación didáctica revisada');

    const asAdmin: OkRes<MaterialResource> = await agent
      .patch(P.Update.format(id))
      .set('Authorization', adminAuth)
      .send({ isApproved: false });
    assert.equal(asAdmin.body.data.isApproved, false);

    const deleted: OkRes<null> = await agent
      .delete(P.Delete.format(id))
      .set('Authorization', adminAuth);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data, null);
    assertError(
      await agent.get(P.GetOne.format(id)).set('Authorization', adminAuth),
      404,
      ErrorCodes.RESOURCE_NOT_FOUND,
    );
  });

  it('6.8.2: exige asignación al DOCENTE, exime a ADMIN y valida catálogos/relaciones', async () => {
    assertError(
      await postMaterial(teacherBAuth),
      403,
      ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT,
    );
    assertError(
      await postMaterial(studentAuth),
      403,
      ErrorCodes.FORBIDDEN_ROLE,
    );

    const byAdmin: OkRes<MaterialDetailResource> =
      await postMaterial(adminAuth);
    assert.equal(byAdmin.status, 201);

    for (const [field, value] of [
      ['materialType', 'NO_EXISTE'],
      ['visibility', 'PUBLICO'],
    ] as const) {
      const res = await postMaterial(adminAuth, { [field]: value });
      assertError(res, 422, ErrorCodes.VALIDATION_ERROR);
    }

    for (const [field, value] of [
      ['subjectId', 9999],
      ['academicPeriodId', 9999],
    ] as const) {
      const res = assertError(
        await postMaterial(adminAuth, { [field]: value }),
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
      assert.deepEqual(
        res.error.details?.map((detail) => detail.field),
        [field],
      );
    }

    await assign();
    assert.equal((await postMaterial(teacherBAuth)).status, 201);
  });

  it('6.8.2: responde 400 sin archivo, 413 si supera 25 MB y 415 si el tipo no es permitido', async () => {
    const withoutFile = await agent
      .post(P.Add.FULL_PATH)
      .set('Authorization', adminAuth)
      .field('subjectId', String(subjectId))
      .field('academicPeriodId', String(periodId))
      .field('title', 'Planeación sin archivo')
      .field('materialType', 'PLANEACION');
    assertError(withoutFile, 400, ErrorCodes.BAD_REQUEST);

    assertError(
      await postMaterial(adminAuth, {
        file: Buffer.alloc(25 * 1024 * 1024 + 1, 0x41),
      }),
      413,
      ErrorCodes.FILE_TOO_LARGE,
    );
    assertError(
      await postMaterial(adminAuth, {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      }),
      415,
      ErrorCodes.FILE_TYPE_NOT_ALLOWED,
    );
    // Extensión permitida con MIME que no corresponde también se rechaza.
    assertError(
      await postMaterial(adminAuth, {
        filename: 'planeacion.pdf',
        contentType: 'text/plain',
      }),
      415,
      ErrorCodes.FILE_TYPE_NOT_ALLOWED,
    );
  });

  it('6.8.1: oculta SOLO_DOCENTES y no aprobados al estudiante; aplica filtros y paginación', async () => {
    const visible: OkRes<MaterialDetailResource> = await postMaterial(
      adminAuth,
      {
        title: 'Planeación didáctica 2026-2',
        materialType: 'PLANEACION',
      },
    );
    const teachersOnly: OkRes<MaterialDetailResource> = await postMaterial(
      adminAuth,
      {
        title: 'Apunte exclusivo de docentes',
        description: 'Material de uso interno.',
        materialType: 'APUNTE',
        visibility: 'SOLO_DOCENTES',
      },
    );
    const unapproved: OkRes<MaterialDetailResource> = await postMaterial(
      adminAuth,
      {
        title: 'Evaluación sin aprobar',
        materialType: 'EVALUACION',
      },
    );
    await agent
      .patch(P.Update.format(unapproved.body.data.id))
      .set('Authorization', adminAuth)
      .send({ isApproved: false });

    const studentList: PageRes<MaterialResource> = await agent
      .get(`${P.Get.FULL_PATH}?visibility=SOLO_DOCENTES`)
      .set('Authorization', studentAuth);
    assert.equal(studentList.status, 200);
    assert.equal(studentList.body.meta.total, 1);
    assert.equal(studentList.body.data[0].id, visible.body.data.id);

    for (const id of [teachersOnly.body.data.id, unapproved.body.data.id]) {
      assertError(
        await agent.get(P.GetOne.format(id)).set('Authorization', studentAuth),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
      assertError(
        await binaryGet(P.Download.format(id), studentAuth),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    const docentsOnly: PageRes<MaterialResource> = await agent
      .get(`${P.Get.FULL_PATH}?visibility=SOLO_DOCENTES`)
      .set('Authorization', adminAuth);
    assert.equal(docentsOnly.body.meta.total, 1);
    assert.equal(docentsOnly.body.data[0].id, teachersOnly.body.data.id);

    const filtered: PageRes<MaterialResource> = await agent
      .get(
        `${P.Get.FULL_PATH}?instituteId=${base.instituteId}&subjectId=${subjectId}&academicPeriodId=${periodId}&authorId=${adminId}&materialType=PLANEACION&search=planeacion&sort=title:asc&page=1&limit=1`,
      )
      .set('Authorization', adminAuth);
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.meta.total, 1);
    assert.equal(filtered.body.data[0].id, visible.body.data.id);
    assert.equal(filtered.body.meta.totalPages, 1);

    const badFilter = await agent
      .get(`${P.Get.FULL_PATH}?materialType=INVALIDO`)
      .set('Authorization', adminAuth);
    assertError(badFilter, 422, ErrorCodes.VALIDATION_ERROR);
  });

  it('6.8.6/6.8.10: sirve binario con cabeceras y aumenta downloadCount en vigente e histórica', async () => {
    const created: OkRes<MaterialDetailResource> =
      await postMaterial(adminAuth);
    const id: number = created.body.data.id;

    const current = await binaryGet(P.Download.format(id), adminAuth);
    assert.equal(current.status, 200);
    assert.equal(current.headers['content-type'], 'application/pdf');
    assert.equal(
      current.headers['content-disposition'],
      'attachment; filename="planeacion.pdf"',
    );
    assert.deepEqual(current.body, PDF);
    assert.equal(
      (await prisma.material.findUnique({ where: { id } }))?.downloadCount,
      1,
    );

    const v2 = await postVersion(adminAuth, id);
    assert.equal(v2.status, 201);
    assert.equal(v2.body.data.versionNumber, 2);
    assert.equal(
      (await prisma.material.findUnique({ where: { id } }))?.currentVersion,
      2,
    );

    const historical = await binaryGet(
      P.DownloadVersion.format(id, 1),
      adminAuth,
    );
    assert.equal(historical.status, 200);
    assert.deepEqual(historical.body, PDF);
    assert.equal(
      (await prisma.material.findUnique({ where: { id } }))?.downloadCount,
      2,
    );

    assertError(
      await binaryGet(P.DownloadVersion.format(id, 999), adminAuth),
      404,
      ErrorCodes.VERSION_NOT_FOUND,
    );
    assertError(
      await binaryGet(P.DownloadVersion.format(id, 1), studentAuth),
      403,
      ErrorCodes.FORBIDDEN_ROLE,
    );
    assert.equal(
      (await binaryGet(P.Download.format(id), studentAuth)).status,
      200,
    );
  });

  it('6.8.7/6.8.9: historial y versión concreta solo para DOCENTE/ADMIN', async () => {
    const created: OkRes<MaterialDetailResource> =
      await postMaterial(adminAuth);
    const id: number = created.body.data.id;
    await postVersion(adminAuth, id);
    await postVersion(adminAuth, id, { file: PDF });

    const history: PageRes<MaterialVersionResource> = await agent
      .get(P.Versions.format(id))
      .set('Authorization', adminAuth);
    assert.equal(history.status, 200);
    assert.equal(history.body.meta.total, 3);
    assert.deepEqual(
      history.body.data.map((version) => version.versionNumber),
      [3, 2, 1],
    );
    noStoragePath(history.body);

    const one: OkRes<MaterialVersionResource> = await agent
      .get(P.GetVersion.format(id, 2))
      .set('Authorization', teacherAAuth);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.versionNumber, 2);
    assert.equal(one.body.data.uploadedBy, adminId);
    noStoragePath(one.body);

    assertError(
      await agent
        .get(P.GetVersion.format(id, 999))
        .set('Authorization', adminAuth),
      404,
      ErrorCodes.VERSION_NOT_FOUND,
    );
    assertError(
      await agent.get(P.Versions.format(id)).set('Authorization', studentAuth),
      403,
      ErrorCodes.FORBIDDEN_ROLE,
    );
    assertError(
      await agent
        .get(P.GetVersion.format(id, 1))
        .set('Authorization', studentAuth),
      403,
      ErrorCodes.FORBIDDEN_ROLE,
    );
  });

  it('6.8.4/5/8: propiedad y asignación vigente en editar, eliminar y versionar', async () => {
    const mine: OkRes<MaterialDetailResource> =
      await postMaterial(teacherAAuth);
    const id: number = mine.body.data.id;
    await assign();
    const foreign: OkRes<MaterialDetailResource> = await postMaterial(
      teacherBAuth,
      { title: 'Apunte del otro docente' },
    );
    const foreignId: number = foreign.body.data.id;

    // La propiedad se comprueba antes que la asignación.
    assertError(
      await postVersion(teacherBAuth, id),
      403,
      ErrorCodes.FORBIDDEN_OWNERSHIP,
    );
    assertError(
      await agent
        .patch(P.Update.format(id))
        .set('Authorization', teacherBAuth)
        .send({ title: 'Intento ajeno' }),
      403,
      ErrorCodes.FORBIDDEN_OWNERSHIP,
    );
    assertError(
      await agent
        .delete(P.Delete.format(foreignId))
        .set('Authorization', teacherAAuth),
      403,
      ErrorCodes.FORBIDDEN_OWNERSHIP,
    );

    // Al retirar la asignación, el autor ya no puede versionar.
    await prisma.subjectAssignment.deleteMany({
      where: { teacherId: teacherAId, subjectId },
    });
    assertError(
      await postVersion(teacherAAuth, id),
      403,
      ErrorCodes.FORBIDDEN_SUBJECT_ASSIGNMENT,
    );

    await prisma.subjectAssignment.create({
      data: {
        subjectId,
        teacherId: teacherAId,
        academicPeriodId: periodId,
        groupCode: '8SC-NUEVA',
      },
    });
    const versioned = await postVersion(teacherAAuth, id);
    assert.equal(versioned.status, 201);
    assert.equal(versioned.body.data.versionNumber, 2);
  });

  it('6.8.5: la baja lógica oculta el material y sus versiones sin borrarlas', async () => {
    const created = await postMaterial(teacherAAuth);
    const id: number = created.body.data.id;
    await postVersion(adminAuth, id);

    assert.equal(
      (
        await agent
          .delete(P.Delete.format(id))
          .set('Authorization', teacherAAuth)
      ).status,
      200,
    );
    for (const path of [
      P.GetOne.format(id),
      P.Download.format(id),
      P.Versions.format(id),
      P.GetVersion.format(id, 1),
      P.DownloadVersion.format(id, 1),
    ]) {
      assertError(
        await agent.get(path).set('Authorization', adminAuth),
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }
    const stored = await prisma.material.findUnique({ where: { id } });
    assert.ok(stored?.deletedAt, 'la baja debe ser lógica');
    assert.equal(
      await prisma.materialVersion.count({ where: { materialId: id } }),
      2,
    );
  });

  it('registra MATERIAL_UPLOADED, PLANEACION_VERSIONED y MATERIAL_VERSIONED', async () => {
    const planeacion: OkRes<MaterialDetailResource> = await postMaterial(
      adminAuth,
      { materialType: 'PLANEACION' },
    );
    const id: number = planeacion.body.data.id;
    await postVersion(adminAuth, id);
    const otro: OkRes<MaterialDetailResource> = await postMaterial(adminAuth, {
      materialType: 'OTRO',
    });
    await postVersion(adminAuth, otro.body.data.id);

    const [uploaded] = await auditLogsFor('MATERIAL_UPLOADED', 2);
    assert.equal(uploaded.entityName, 'materials');
    assert.equal(uploaded.entityId, id);
    assert.deepEqual(uploaded.metadata, {
      ip: '127.0.0.1',
      method: 'POST',
      path: `/api/v1${P.PATH}`,
      materialType: 'PLANEACION',
      versionNumber: 1,
    });

    const [planeacionVersioned] = await auditLogsFor('PLANEACION_VERSIONED');
    assert.equal(planeacionVersioned.entityName, 'materials');
    assert.equal(planeacionVersioned.entityId, id);
    assert.equal(
      (planeacionVersioned.metadata as { versionNumber?: number })
        .versionNumber,
      2,
    );

    const [materialVersioned] = await auditLogsFor('MATERIAL_VERSIONED');
    assert.equal(materialVersioned.entityName, 'materials');
    assert.equal(materialVersioned.entityId, otro.body.data.id);
  });
});
