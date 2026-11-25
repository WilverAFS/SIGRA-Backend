import { type Channel, type ChannelModel, connect } from 'amqplib';
import logger from 'jet-logger';

import { Env } from '#src/common/constants/env.constants.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

/** Cola durable de eventos de auditoría (contrato 2.2 y 6.9). */
export const AUDIT_QUEUE = 'sigra.audit';

// ========================================================================= //
//                                   STATE                                   //
// ========================================================================= //

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

function reset() {
  connection = null;
  channel = null;
  connecting = null;
}

/**
 * Canal compartido de RabbitMQ. Se conecta al primer uso y, si la conexión
 * se cae, el siguiente uso vuelve a conectar.
 */
export async function getChannel(): Promise<Channel> {
  if (channel) return channel;
  connecting ??= (async () => {
    try {
      const conn = await connect(Env.RABBITMQ_URL, { timeout: 2000 });
      conn.on('error', (err: Error) => {
        logger.err(`RabbitMQ error: ${err.message}`);
      });
      conn.on('close', reset);
      const ch = await conn.createChannel();
      await ch.assertQueue(AUDIT_QUEUE, { durable: true });
      connection = conn;
      channel = ch;
      return ch;
    } catch (err) {
      reset();
      throw err;
    }
  })();
  return connecting;
}

/** Cerrar la conexión (al apagar el servidor o al terminar los tests). */
export async function closeRabbit(): Promise<void> {
  const conn = connection;
  reset();
  if (conn) {
    try {
      await conn.close();
    } catch (_err) {
      // ya estaba cerrada
    }
  }
}
