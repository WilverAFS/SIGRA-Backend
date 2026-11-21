import type { NextFunction, Request, Response } from 'express';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import redis, { ensureRedisConnected } from '#src/common/infra/redis.ts';

const WINDOW_SECONDS = 15 * 60; // 15 minutos

function createRedisLimiter(
  prefix: string,
  maxRequests: number,
  keyExtractor: (req: Request) => string,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await ensureRedisConnected();
      const key = `ratelimit:${prefix}:${keyExtractor(req)}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }
      if (count > maxRequests) {
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', String(Math.max(ttl, 1)));
        return next(
          new RouteError(
            ErrorCodes.RATE_LIMIT_EXCEEDED,
            'Demasiados intentos. Intenta de nuevo más tarde.',
          ),
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** 10 req / 15 min por IP + email (para login y register) */
export const authRateLimit = createRedisLimiter('auth', 10, (req) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const body = req.body as { email?: unknown } | undefined;
  const email =
    typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
  return `${ip}:${email}`;
});

/** 60 req / 15 min por IP (para refresh) */
export const refreshRateLimit = createRedisLimiter('refresh', 60, (req) => {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
});
