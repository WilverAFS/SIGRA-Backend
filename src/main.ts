import logger from 'jet-logger';

import { Env } from './common/constants/env.constants.ts';
import server from './server.ts';
import AuditService from './services/AuditService.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const SERVER_START_MESSAGE = `Express server started on port: ${Env.PORT}`;

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

// Start the server
server.listen(Env.PORT, (err) => {
  if (!!err) {
    logger.err(err.message);
  } else {
    logger.info(SERVER_START_MESSAGE);
  }
});

// Consumidor de la cola de auditoría (6.9): persiste los eventos de RabbitMQ
if (Env.AUDIT_ASYNC) {
  void AuditService.startConsumer();
}
