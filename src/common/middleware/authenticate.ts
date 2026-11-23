import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import {
  isAccessTokenBlacklisted,
  verifyAccessToken,
} from '#src/common/utils/jwt.utils.ts';
import UserRepo from '#src/repos/UserRepo.ts';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(
      new RouteError(
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'Token de autenticación requerido.',
      ),
    );
  }

  const token = header.slice(7).trim();
  try {
    const payload = verifyAccessToken(token);
    if (await isAccessTokenBlacklisted(payload.jti)) {
      return next(
        new RouteError(
          ErrorCodes.AUTH_TOKEN_REVOKED,
          'El token ha sido revocado.',
        ),
      );
    }

    const user = await UserRepo.findById(payload.sub);
    if (!user) {
      return next(
        new RouteError(
          ErrorCodes.AUTH_INVALID_CREDENTIALS,
          'Usuario no válido.',
        ),
      );
    }
    if (!user.isActive) {
      return next(
        new RouteError(
          ErrorCodes.AUTH_USER_INACTIVE,
          'La cuenta de usuario está inactiva.',
        ),
      );
    }

    res.locals.user = user;
    res.locals.tokenPayload = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(
        new RouteError(
          ErrorCodes.AUTH_TOKEN_EXPIRED,
          'El token de acceso ha expirado.',
        ),
      );
    }
    return next(
      new RouteError(
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'Token de acceso inválido.',
      ),
    );
  }
}
