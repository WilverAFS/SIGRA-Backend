import supertest from 'supertest';

import app from '#src/server.ts';

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

/** Cliente HTTP de pruebas sobre la app de Express (sin abrir un puerto). */
export const agent = supertest(app);
