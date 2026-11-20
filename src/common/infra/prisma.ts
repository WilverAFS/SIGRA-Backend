import { PrismaClient } from '@prisma/client';

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

/**
 * Instancia única de Prisma Client para toda la app. Toma `DATABASE_URL`
 * del archivo `config/.env.*` cargado al arrancar.
 */
const prisma = new PrismaClient();

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default prisma;
