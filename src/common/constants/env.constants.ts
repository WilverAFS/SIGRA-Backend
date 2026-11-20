/* eslint-disable no-process-env */
import logger from 'jet-logger';
import { z } from 'zod';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

// NOTE: These need to match the names of your ".env" files
export const NodeEnvs = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;
export type NodeEnvs = z.infer<typeof NodeEnvsEnum>;

export const Env = {
  NODE_ENV: process.env.NODE_ENV?.toLowerCase(),
  PORT: Number(process.env.PORT),
  // Orígenes permitidos por CORS, separados por comas (contrato 2.4).
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? '',
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? '',
} as const;

// ========================================================================= //
//                                   EXEC                                    //
// ========================================================================= //

const NodeEnvsEnum = z.enum(NodeEnvs, 'Not a valid node environment');

const EnvSchema = z.object({
  NODE_ENV: NodeEnvsEnum,
  PORT: z.uint32('Express port must be a positive integer'),
  CORS_ORIGIN: z
    .array(z.string())
    .min(1, 'CORS_ORIGIN must list at least one origin')
    .refine(
      (origins) => !origins.includes('*'),
      'CORS_ORIGIN cannot be a wildcard (*)',
    ),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
});

// ===================== Validate Environment Variables ==================== //

{
  try {
    EnvSchema.parse(Env);
  } catch (err) {
    logger.err(err);
    throw err;
  }
}
