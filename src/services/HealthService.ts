import { connect as amqpConnect } from 'amqplib';
import { createClient } from 'redis';

import { Env } from '#src/common/constants/env.constants.ts';
import prisma from '#src/common/infra/prisma.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

export type ServiceStatus = 'up' | 'down';

/** HealthResource (contrato 5.4.12). */
export interface HealthResource {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
  services: {
    database: ServiceStatus;
    cache: ServiceStatus;
    queue: ServiceStatus;
  };
}

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const API_VERSION = '1.2.0';
const TIMEOUT_MS = 2000;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Rechazar si la promesa no termina a tiempo, para que un servicio colgado
 * no deje colgado el healthcheck.
 */
async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function toStatus(check: () => Promise<unknown>): Promise<ServiceStatus> {
  try {
    await withTimeout(check());
    return 'up';
  } catch (_err) {
    return 'down';
  }
}

/** PostgreSQL: consulta trivial a través de Prisma. */
function checkDatabase(): Promise<ServiceStatus> {
  return toStatus(() => prisma.$queryRaw`SELECT 1`);
}

/** Redis: conexión nueva, PING y cierre. */
function checkCache(): Promise<ServiceStatus> {
  return toStatus(async () => {
    const client = createClient({
      url: Env.REDIS_URL,
      socket: { connectTimeout: TIMEOUT_MS, reconnectStrategy: false },
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.destroy();
    }
  });
}

/** RabbitMQ: abrir y cerrar una conexión AMQP. */
function checkQueue(): Promise<ServiceStatus> {
  return toStatus(async () => {
    const connection = await amqpConnect(Env.RABBITMQ_URL, {
      timeout: TIMEOUT_MS,
    });
    connection.on('error', () => undefined);
    await connection.close();
  });
}

/**
 * Estado real de la API y sus dependencias (contrato 6.9.3). Si alguna está
 * caída, `status` es `degraded` y el router responde 503.
 */
async function getHealth(): Promise<HealthResource> {
  const [database, cache, queue] = await Promise.all([
    HealthService.checkDatabase(),
    HealthService.checkCache(),
    HealthService.checkQueue(),
  ]);
  const allUp = database === 'up' && cache === 'up' && queue === 'up';
  return {
    status: allUp ? 'ok' : 'degraded',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    services: { database, cache, queue },
  };
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

// Los checks se exponen en el objeto para poder simularlos en los tests.
const HealthService = {
  getHealth,
  checkDatabase,
  checkCache,
  checkQueue,
};

export default HealthService;
