import type { NextFunction, Request, Response } from 'express';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import type { RoleName, UserWithRole } from '#src/entities/User/index.ts';

export function authorizeRoles(...allowedRoles: RoleName[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user as UserWithRole | undefined;
    if (!user) {
      return next(
        new RouteError(
          ErrorCodes.AUTH_INVALID_CREDENTIALS,
          'No autenticado.',
        ),
      );
    }
    if (!allowedRoles.includes(user.role.name as RoleName)) {
      return next(
        new RouteError(
          ErrorCodes.FORBIDDEN_ROLE,
          'No tienes permisos para acceder a este recurso.',
        ),
      );
    }
    next();
  };
}
