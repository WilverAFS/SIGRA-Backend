/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando el proceso de seeder para SIGRA...');

  // 1. Roles del Sistema
  console.log('Insertando roles...');
  await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Control total del sistema: gestión de institutos, carreras, materias, usuarios y auditoría',
    },
  });

  await prisma.role.upsert({
    where: { name: 'DOCENTE' },
    update: {},
    create: {
      name: 'DOCENTE',
      description: 'Consulta de retícula, creación y versionamiento de planeaciones docentes y materiales',
    },
  });

  await prisma.role.upsert({
    where: { name: 'ESTUDIANTE' },
    update: {},
    create: {
      name: 'ESTUDIANTE',
      description: 'Consulta y descarga de materiales educativos autorizados por asignatura',
    },
  });

  // 2. Instituto (Tecnológico de Oaxaca)
  console.log('Insertando instituto...');
  const institute = await prisma.institute.upsert({
    where: { code: '20DIT0002N' },
    update: {},
    create: {
      code: '20DIT0002N',
      name: 'Instituto Tecnológico de Oaxaca',
      shortName: 'ITO',
      city: 'Oaxaca de Juárez',
      state: 'Oaxaca',
    },
  });

  // 3. Carrera (Ingeniería en Sistemas Computacionales)
  console.log('Insertando carrera...');
  const career = await prisma.career.upsert({
    where: {
      instituteId_curriculumCode: {
        instituteId: institute.id,
        curriculumCode: 'ISIC-2010-224',
      },
    },
    update: {},
    create: {
      instituteId: institute.id,
      curriculumCode: 'ISIC-2010-224',
      name: 'Ingeniería en Sistemas Computacionales',
      shortName: 'ISC',
      totalSemesters: 9,
    },
  });

  // 4. Periodos Académicos
  console.log('Insertando periodos académicos...');
  await prisma.academicPeriod.upsert({
    where: { code: '2026-1' },
    update: {},
    create: {
      code: '2026-1',
      name: 'Enero - Junio 2026',
      startDate: new Date('2026-01-26'),
      endDate: new Date('2026-06-12'),
      isCurrent: false,
    },
  });

  await prisma.academicPeriod.upsert({
    where: { code: '2026-2' },
    update: {},
    create: {
      code: '2026-2',
      name: 'Agosto - Diciembre 2026',
      startDate: new Date('2026-08-24'),
      endDate: new Date('2026-12-11'),
      isCurrent: true,
    },
  });

  // 5. Materias de la retícula
  console.log('Insertando materias...');
  const subjectsData = [
    {
      code: 'AED-1286',
      name: 'Estructura de Datos',
      semester: 3,
      creditsTheory: 2,
      creditsPractice: 3,
      totalCredits: 5,
      syllabusSummary: 'Listas, pilas, colas, árboles, grafos y algoritmos de ordenamiento y búsqueda.',
    },
    {
      code: 'SCA-1025',
      name: 'Taller de Bases de Datos',
      semester: 5,
      creditsTheory: 1,
      creditsPractice: 3,
      totalCredits: 4,
      syllabusSummary: 'Lenguaje SQL, procedimientos almacenados, triggers, transacciones y seguridad.',
    },
    {
      code: 'DSD-2303',
      name: 'Desarrollo de Servicios Web',
      semester: 8,
      creditsTheory: 2,
      creditsPractice: 3,
      totalCredits: 5,
      syllabusSummary: 'Arquitecturas REST/SOAP, autenticación JWT, caché distribuido, colas de mensajes y despliegue.',
    },
  ];

  for (const subj of subjectsData) {
    await prisma.subject.upsert({
      where: {
        careerId_code: {
          careerId: career.id,
          code: subj.code,
        },
      },
      update: {},
      create: {
        careerId: career.id,
        ...subj,
      },
    });
  }

  console.log('✅ ¡Base de datos poblada exitosamente con el seeder!');
}

main()
  .catch((e) => {
    console.error('❌ Error durante la ejecución del seeder:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });