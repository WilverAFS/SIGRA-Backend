import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import redis, { ensureRedisConnected } from '#src/common/infra/redis.ts';
import type { RoleName } from '#src/entities/User/index.ts';

export const ACCESS_TOKEN_EXPIRES_IN = 3600; // 60 minutos en segundos
const ACCESS_TOKEN_TTL = '60m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const getAccessSecret = (): string =>
  // eslint-disable-next-line no-process-env
  process.env.JWT_SECRET ?? 'sigra_jwt_secret_dev_key_2026';
const getRefreshSecret = (): string =>
  // eslint-disable-next-line no-process-env
  process.env.JWT_REFRESH_SECRET ?? 'sigra_jwt_refresh_dev_key_2026';

export interface AccessTokenPayload {
  sub: number;
  role: RoleName;
  jti: string;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: number;
  jti: string;
}

export function signAccessToken(userId: number, role: RoleName): string {
  const payload: AccessTokenPayload = { sub: userId, role, jti: uuidv4() };
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export async function signAndStoreRefreshToken(userId: number): Promise<string> {
  await ensureRedisConnected();
  const jti = uuidv4();
  const payload: RefreshTokenPayload = { sub: userId, jti };
  const token = jwt.sign(payload, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_TTL,
  });
  await redis.set(`refresh:${jti}`, String(userId), {
    EX: REFRESH_TTL_SECONDS,
  });
  return token;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getAccessSecret()) as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getRefreshSecret()) as unknown as RefreshTokenPayload;
}

export async function isRefreshTokenValid(
  jti: string,
  userId: number,
): Promise<boolean> {
  await ensureRedisConnected();
  const stored = await redis.get(`refresh:${jti}`);
  return stored === String(userId);
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await ensureRedisConnected();
  await redis.del(`refresh:${jti}`);
}

export async function blacklistAccessToken(
  jti: string,
  exp?: number,
): Promise<void> {
  await ensureRedisConnected();
  const now = Math.floor(Date.now() / 1000);
  const ttl = exp ? Math.max(exp - now, 1) : ACCESS_TOKEN_EXPIRES_IN;
  await redis.set(`blacklist:${jti}`, '1', { EX: ttl });
}

export async function isAccessTokenBlacklisted(jti: string): Promise<boolean> {
  await ensureRedisConnected();
  const exists = await redis.exists(`blacklist:${jti}`);
  return exists === 1;
}
