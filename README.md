
<div align="center">
  <h3>TECNOLÓGICO NACIONAL DE MÉXICO</h3>
  <h2>INSTITUTO TECNOLÓGICO DE OAXACA</h2>
  <p><strong>Ingeniería en Sistemas Computacionales</strong></p>
  <hr>
  <h1>SIGRA</h1>
  <h3>Backend del proyecto</h3>
  <p><strong>Sistema de Gestión de Recursos Académicos</strong></p>
  <p>
    <strong>Materia:</strong> DSD-2303 · Desarrollo de Servicios Web<br>
    <strong>Semestre:</strong> 8.º &nbsp; | &nbsp; <strong>Grupo:</strong> 8SC<br>
    <strong>Docente:</strong> Ing. Luis Angel Zaragoza Farrera
  </p>
  <h4>Integrantes del Equipo</h4>
  <p>
    Flores Santiago Wilver Alfredo<br>
    Cruz Alonso Kelly Adanari<br>
    Pacheco Cruz Diego<br>
    Magaña Peralta Sherlin<br>
    Bustamante Rios Flor Estephany<br>
  </p>
  <p><strong>Oaxaca de Juárez, Oaxaca · 2026</strong></p>
  <p><strong>Estado:</strong> En desarrollo &nbsp;·&nbsp; <strong>Estándar:</strong> API REST v1.2 (<code>/api/v1</code>)</p>
</div>

---

## 1. Descripción del proyecto

**SIGRA (Sistema de Gestión de Recursos Académicos)** es una aplicación web diseñada para centralizar, organizar, versionar y compartir planeaciones didácticas, temarios, apuntes, prácticas y evaluaciones entre docentes y estudiantes del **Instituto Tecnológico de Oaxaca**, con una arquitectura preparada para escalar a múltiples institutos y carreras.

La plataforma busca evitar la dispersión de materiales educativos y mantener trazabilidad sobre las actualizaciones de los programas de estudio mediante control de versiones de archivos, verificación de integridad (`SHA-256`), permisos basados en roles (`ADMIN`, `DOCENTE`, `ESTUDIANTE`) y búsquedas filtradas por carrera, semestre, asignatura y periodo académico.

## 2. Descripción de este repositorio

Este repositorio aloja el **backend de SIGRA**, desarrollado con **Node.js, Express y TypeScript**. Su responsabilidad es exponer la API RESTful bajo el prefijo `/api/v1`, validar los contratos de entrada, aplicar las reglas de negocio y control de acceso, gestionar el almacenamiento de recursos y comunicarse con la base de datos y servicios auxiliares.

Las áreas funcionales previstas para el backend son:

- **Autenticación y Sesión (`/api/v1/auth`):** registro institucional, inicio y cierre de sesión mediante tokens JWT, renovación de sesión y gestión de perfil.
- **Usuarios y Roles (`/api/v1/users`):** administración de cuentas institucionales y control de acceso basado en roles (`ADMIN`, `DOCENTE`, `ESTUDIANTE`).
- **Estructura Académica:** gestión de institutos, carreras, periodos académicos, retícula de asignaturas y carga docente por grupo.
- **Repositorio y Versionamiento de Materiales:** carga de documentos académicos, historial de versiones, control de visibilidad (`ESTUDIANTES_Y_DOCENTES` / `SOLO_DOCENTES`) y conteo de descargas.
- **Auditoría y Monitoreo:** registro asíncrono de eventos de dominio mediante colas de mensajes y verificación de estado del servicio (`/api/v1/health`).

## 3. Tecnologías

| Tecnología | Uso |
|---|---|
| Node.js (v18+ / v20 LTS) | Entorno de ejecución del servidor. |
| TypeScript | Tipado estático y estructuración por capas del código fuente. |
| Express.js | Framework web para el enrutamiento y middlewares de la API REST. |
| Prisma ORM (v5) | Mapeo objeto-relacional, sincronización de esquema y seeders. |
| PostgreSQL 16+ | Sistema gestor de base de datos relacional (esquema en 3FN). |
| Zod | Validación estricta de esquemas de entrada y contratos de la API. |
| Redis | Caché de consultas frecuentes y gestión de sesiones. |
| RabbitMQ (`amqplib`) | Mensajería asíncrona para la bitácora de auditoría (`audit_logs`). |
| Git y GitHub | Control de versiones y colaboración mediante ramas y Pull Requests. |
| Visual Studio Code | Editor de desarrollo recomendado. |

**Arquitectura prevista:** Frontend (SPA) ↔ Backend API REST (Express + TypeScript) ↔ PostgreSQL / Redis / RabbitMQ.

## 4. Requisitos previos

Antes de instalar el backend, verifica que tengas instalados en tu equipo:

- **Node.js (v18 o superior)** y **npm**.
- **PostgreSQL 16 o superior** en ejecución.
- **Redis** y **RabbitMQ** instalados o ejecutándose mediante contenedores (requeridos para los módulos de caché y auditoría).
- **Git** y acceso al repositorio.

Para comprobar las herramientas principales en tu terminal:

```bash
node -v
npm -v
psql --version
git --version

```

## 5. Guía de instalación local

### 5.1 Clonar el repositorio

En una terminal (Bash en Linux/macOS o PowerShell en Windows):

```bash
git clone [https://github.com/WilverAFS/SIGRA-Backend.git](https://github.com/WilverAFS/SIGRA-Backend.git)
cd SIGRA-Backend

```

Si ya tienes el repositorio clonado, **no vuelvas a clonarlo**. Entra a tu carpeta existente y actualiza la rama principal.

### 5.2 Instalar dependencias

```bash
npm install

```

Este comando instala todas las dependencias registradas en `package-lock.json` y genera el cliente de Prisma.

### 5.3 Crear la base de datos y usuario en PostgreSQL

Conéctate a PostgreSQL como superusuario y crea la base de datos `sigra_db` junto con un usuario dedicado para la aplicación:

```bash
sudo -u postgres psql

```

Dentro de la consola de PostgreSQL ejecuta:

```sql
CREATE DATABASE sigra_db;
CREATE USER sigra_db_admin WITH PASSWORD 'tu_contraseña_segura';
GRANT ALL PRIVILEGES ON DATABASE sigra_db TO sigra_db_admin;

\c sigra_db
GRANT ALL ON SCHEMA public TO sigra_db_admin;
\q

```

### 5.4 Configurar las variables de entorno

Copia la plantilla `.env.example` tanto en la raíz del proyecto (requerida por Prisma CLI) como en la carpeta `config/` (requerida por Express):

```bash
cp .env.example .env
cp .env.example config/.env.development

```

*(En Windows PowerShell usa `Copy-Item .env.example .env` y `Copy-Item .env.example config\.env.development`).*

Abre ambos archivos y ajusta tus credenciales locales:

```dotenv
NODE_ENV=development
PORT=3000

DATABASE_URL="postgresql://sigra_db_admin:tu_contraseña_segura@localhost:5432/sigra_db?schema=public"
REDIS_URL="redis://localhost:6379"
RABBITMQ_URL="amqp://localhost:5672"

JWT_SECRET="reemplazar_con_un_secret_seguro"
JWT_REFRESH_SECRET="reemplazar_con_un_refresh_secret_seguro"

```

> **Importante:** nunca subas los archivos `.env` o `config/.env.*` con credenciales reales al repositorio.

### 5.5 Aplicar migraciones y poblar datos iniciales (Seeder)

El esquema se versiona con migraciones de Prisma en `prisma/migrations/`. Aplica las migraciones en PostgreSQL y ejecuta el seeder para cargar los roles base, el Instituto Tecnológico de Oaxaca, la carrera de ISC, los periodos académicos y las materias iniciales:

```bash
npx prisma migrate deploy
npx prisma db seed

```

> Si cambias `prisma/schema.prisma`, genera una migración nueva con `npx prisma migrate dev --name <descripcion>` y súbela junto con tu cambio. No uses `prisma db push` en ramas compartidas.

### 5.6 Iniciar el servidor y verificar funcionamiento

```bash
npm run dev

```

Para comprobar que la API responde correctamente, realiza una petición `GET` a **http://localhost:3000/api/v1/health**:

```bash
curl http://localhost:3000/api/v1/health

```

La respuesta comprueba en tiempo real PostgreSQL, Redis y RabbitMQ: `"status": "ok"` con 200 si todo responde, o `"status": "degraded"` con 503 si alguna dependencia está caída. Para detener el servidor, presiona **Ctrl + C** en la terminal.

### 5.7 Documentación de la API (Swagger)

Con el servidor encendido, abre **http://localhost:3000/api/v1/docs** (el JSON de OpenAPI está en `/api/v1/docs.json`). Cada actividad debe documentar sus endpoints en `src/docs/openapi.ts`.

### 5.8 Pruebas automatizadas

Las pruebas usan una base de datos **separada** (`sigra_test`, definida en `config/.env.test`), porque cada corrida la vacía por completo. Créala una sola vez:

```sql
CREATE DATABASE sigra_test OWNER sigra_db_admin;

```

Después ejecuta:

```bash
npm test

```

El harness (`tests/support/db.ts`) aplica las migraciones a `sigra_test`, limpia las tablas antes de cada prueba y carga roles, un instituto y una carrera. Usa `useTestDatabase()`, `resetDb()` e `insertUser()` en las pruebas de tu módulo.

### 5.9 Bitácora de auditoría (RabbitMQ)

Toda mutación exitosa (`POST`, `PATCH`, `PUT`, `DELETE` con respuesta 2xx) bajo `/api/v1` se registra **automáticamente** con el middleware `auditTrail` (`src/common/middleware/audit-trail.ts`): acción `<ENTIDAD>_CREATED | _UPDATED | _DELETED`, entidad tomada de la ruta, usuario autenticado, IP y los nombres de los campos modificados (nunca sus valores). El evento se publica en la cola `sigra.audit` de RabbitMQ y el consumidor que arranca con el servidor lo guarda en `audit_logs`; si RabbitMQ no responde, se guarda directo para no perderlo.

Para cambiar lo que se registra (por ejemplo `MATERIAL_UPLOADED` o `PLANEACION_VERSIONED`), la ruta deja un `AuditOverride` en `res.locals.audit` antes de responder:

```ts
res.locals.audit = { action: AuditActions.PLANEACION_VERSIONED, metadata: { versionNumber: 2 } };
```

`AUDIT_ASYNC=false` (en `config/.env.test`) guarda los eventos directo en la BD para que las pruebas sean deterministas.

## 6. Estructura general del backend

```text
config/             Archivos de configuración por entorno (.env.development, .env.test, .env.production)
prisma/
  ├── schema.prisma   Definición de modelos relacionales en 3FN y mapeo a PostgreSQL
  └── seed.ts         Script automatizado de carga de datos institucionales base
src/
  ├── common/         Constantes globales, manejo de errores, definiciones de rutas (Paths) y utilidades
  ├── entities/       Entidades e interfaces de dominio
  ├── public/         Recursos estáticos públicos
  ├── repos/          Capa de acceso a datos mediante Prisma Client
  ├── routers/        Definición de rutas y agrupación de endpoints bajo /api/v1
  ├── services/       Lógica de negocio, controladores y validaciones de esquemas con Zod
  ├── views/          Vistas HTML base
  ├── main.ts         Punto de entrada e inicialización del servidor HTTP
  └── server.ts       Configuración de la instancia de Express y middlewares globales
tests/              Pruebas automatizadas de integración y endpoints
.env.example        Plantilla de variables de entorno sin secretos
prisma.config.ts    Configuración de Prisma CLI
package.json        Dependencias y scripts del proyecto
tsconfig.json       Configuración del compilador de TypeScript

```

## 7. Flujo de colaboración con Git y GitHub

Las contribuciones se desarrollan en **ramas personales creadas a partir de `main**`. No se deben subir cambios directamente a `main` sin la revisión correspondiente del equipo.

### 7.1 Actualizar la rama principal local

```bash
git status
git switch main
git pull --ff-only origin main

```

Antes de cambiar de rama, asegúrate de no tener modificaciones locales pendientes sin guardar.

### 7.2 Crear una rama personal

```bash
git switch -c back-wafs

```

`back-wafs` es un ejemplo usando iniciales. Cada integrante debe crear su propia rama según el módulo asignado (por ejemplo, `back-auth`, `back-materials`, etc.).

### 7.3 Editar, revisar y guardar cambios

```bash
git status
git diff
git add <archivos-modificados>
git commit -m "feat(auth): implementar validacion de registro con Zod"

```

Agrega únicamente los archivos relacionados con tu tarea siguiendo convenciones claras en los mensajes de commit (`feat:`, `fix:`, `docs:`, `refactor:`).

### 7.4 Publicar la rama

```bash
git push -u origin back-wafs

```

### 7.5 Crear un Pull Request

En GitHub, selecciona **Compare & pull request** (o **Pull requests → New pull request**), configurando:

* **Base:** `main`
* **Compare:** tu rama personal

Describe los endpoints o cambios implementados, cómo los verificaste y solicita revisión antes de fusionar.

## 8. Buenas prácticas

* Respetar el prefijo global `/api/v1` y las estructuras de respuesta definidas en el **ContratoAPI-SIGRA**: responder con `sendSuccess`, `sendCreated` o `sendPage` (`src/common/utils/response.utils.ts`) y lanzar errores con `RouteError` y los códigos de `src/common/constants/ErrorCodes.ts` (catálogo 4.3).
* Validar todos los cuerpos de petición (`body`), parámetros (`params`) y consultas (`query`) con el middleware `validate()` y las reglas compartidas de `src/common/validation/` (5.2 y `ListQueryRequest` 5.5.15). Los errores de campo responden 422 `VALIDATION_ERROR`.
* No subir archivos `.env`, `node_modules/`, `dist/` ni credenciales al repositorio.
* Conservar `package-lock.json` sincronizado para garantizar reproducibilidad en todo el equipo.
* Actualizar `prisma/schema.prisma` y coordinar con el equipo antes de modificar tablas o restricciones compartidas.

## 9. Equipo y enlaces

Proyecto académico de Ingeniería en Sistemas Computacionales, **Instituto Tecnológico de Oaxaca**.

* **Repositorio Frontend:** https://github.com/WilverAFS/SIGRA-Backend
* **Repositorio Backend:** https://github.com/WilverAFS/SIGRA-Frontend
* **Documentación de Express:** https://expressjs.com/
* **Documentación de Prisma:** https://www.prisma.io/docs
* **Documentación de Zod:** https://zod.dev/
* **Documentación de TypeScript:** https://www.typescriptlang.org/docs/

---

*SIGRA — Sistema de Gestión y Repositorio Colaborativo de Planeación y Recursos Académicos.*



