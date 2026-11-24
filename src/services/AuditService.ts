import type { ConsumeMessage } from 'amqplib';
import logger from 'jet-logger';

import { NotFoundError } from '#src/common/classes/route-errors.ts';
import { Env, NodeEnvs } from '#src/common/constants/env.constants.ts';
import {
  AUDIT_QUEUE,
  closeRabbit,
  getChannel,
} from '#src/common/infra/rabbitmq.ts';
import type { Page } from '#src/common/utils/response.utils.ts';
import {
  type AuditContext,
  type AuditEvent,
  AuditEventSchema,
  type AuditLogListQuery,
  type AuditLogResource,
  sanitizeMetadata,
  toAuditLogResource,
} from '#src/entities/AuditLog/index.ts';
import AuditLogRepo from '#src/repos/AuditLogRepo.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const AuditMessages = {
  LISTED: 'Eventos de auditoría obtenidos correctamente.',
  FOUND: 'Evento de auditoría obtenido correctamente.',
  NOT_FOUND: 'El evento de auditoría no existe.',
} as const;

const CONSUMER_RETRY_MS = 5000;

/** Registros en curso (los lanza el middleware sin esperar la respuesta). */
const pending = new Set<Promise<void>>();

/** En true, el consumidor deja de reintentar (apagado o fin de tests). */
let stopped = false;

function retryConsumer() {
  if (!stopped)
    setTimeout(() => void AuditService.startConsumer(), CONSUMER_RETRY_MS);
}
const PREFETCH = 10;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

function logError(message: string) {
  if (Env.NODE_ENV !== NodeEnvs.TEST) logger.err(message);
}

/**
 * Guardar el evento directo en la BD.
 */
async function persist(event: AuditEvent): Promise<void> {
  await AuditLogRepo.create(event);
}

/**
 * Publicar el evento en la cola durable de RabbitMQ.
 */
async function publish(event: AuditEvent): Promise<void> {
  const channel = await getChannel();
  channel.sendToQueue(AUDIT_QUEUE, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: 'application/json',
  });
}

/**
 * Registrar una acción en la bitácora (contrato 6.9). Se llama después de
 * que la operación de negocio terminó bien.
 *
 * - Con AUDIT_ASYNC=true (desarrollo y producción) el evento viaja por
 *   RabbitMQ y el consumidor lo persiste; si RabbitMQ no responde, se guarda
 *   directo para no perderlo.
 * - Nunca lanza: una falla de auditoría no debe tumbar la operación del
 *   usuario.
 */
async function record(
  context: AuditContext,
  action: string,
  entityName: string,
  entityId: number | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  const clean = sanitizeMetadata(metadata);
  const event: AuditEvent = {
    userId: context.userId,
    action,
    entityName,
    entityId,
    metadata: context.ip ? { ...clean, ip: context.ip } : clean,
    occurredAt: new Date().toISOString(),
  };
  try {
    if (Env.AUDIT_ASYNC) {
      try {
        await AuditService.publish(event);
        return;
      } catch (err) {
        logError(
          `Auditoría: RabbitMQ no disponible, se guarda directo (${String(err)})`,
        );
      }
    }
    await AuditService.persist(event);
  } catch (err) {
    logError(`Auditoría: no se pudo registrar ${action} (${String(err)})`);
  }
}

/**
 * Registrar sin bloquear a quien llama (lo usa el middleware al terminar la
 * respuesta). `drain()` permite esperar a que terminen.
 */
function recordInBackground(...args: Parameters<typeof record>): void {
  const task = AuditService.record(...args).finally(() => {
    pending.delete(task);
  });
  pending.add(task);
}

/** Esperar los registros en curso (al apagar el servidor y en los tests). */
async function drain(): Promise<void> {
  await Promise.all([...pending]);
}

/**
 * Procesar un mensaje de la cola. Un mensaje inválido se descarta (no tiene
 * caso reintentarlo); un error de BD se propaga para reencolarlo.
 */
async function processMessage(
  content: Buffer,
): Promise<'stored' | 'discarded'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf8'));
  } catch (_err) {
    return 'discarded';
  }
  const result = AuditEventSchema.safeParse(parsed);
  if (!result.success) return 'discarded';
  await AuditService.persist({
    ...result.data,
    metadata: sanitizeMetadata(result.data.metadata),
  });
  return 'stored';
}

/**
 * Consumidor de la cola de auditoría. Se inicia junto con el servidor; si
 * RabbitMQ no está disponible, reintenta cada 5 segundos.
 */
async function startConsumer(): Promise<void> {
  stopped = false;
  try {
    const channel = await getChannel();
    await channel.prefetch(PREFETCH);
    await channel.consume(AUDIT_QUEUE, (msg: ConsumeMessage | null) => {
      if (!msg) {
        // El broker canceló el consumidor (p. ej. se reinició)
        retryConsumer();
        return;
      }
      AuditService.processMessage(msg.content)
        .then((outcome) => {
          if (outcome === 'discarded') {
            logError('Auditoría: mensaje inválido descartado.');
          }
          channel.ack(msg);
        })
        .catch((err: unknown) => {
          logError(`Auditoría: error al guardar, se reencola (${String(err)})`);
          channel.nack(msg, false, true);
        });
    });
    channel.once('close', retryConsumer);
    logger.info(`Auditoría: consumiendo la cola ${AUDIT_QUEUE}`);
  } catch (err) {
    logError(
      `Auditoría: RabbitMQ no disponible, reintento en ${CONSUMER_RETRY_MS / 1000}s (${String(err)})`,
    );
    retryConsumer();
  }
}

/** Detener el consumidor y cerrar la conexión con RabbitMQ. */
async function stopConsumer(): Promise<void> {
  stopped = true;
  await closeRabbit();
}

/** 6.9.1 Listar eventos. */
async function list(query: AuditLogListQuery): Promise<Page<AuditLogResource>> {
  const { items, total } = await AuditLogRepo.findMany(query);
  return {
    items: items.map(toAuditLogResource),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/** 6.9.2 Obtener evento. */
async function getOne(id: bigint): Promise<AuditLogResource> {
  const log = await AuditLogRepo.findById(id);
  if (!log) throw new NotFoundError(AuditMessages.NOT_FOUND);
  return toAuditLogResource(log);
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

// Las funciones internas se exponen en el objeto para simularlas en tests.
const AuditService = {
  record,
  recordInBackground,
  drain,
  publish,
  persist,
  processMessage,
  startConsumer,
  stopConsumer,
  list,
  getOne,
};

export default AuditService;
