import { Router } from 'express';

import Paths from '#src/common/constants/Paths/index.ts';
import type { AuditOverride } from '#src/common/middleware/audit-trail.ts';
import { authenticate } from '#src/common/middleware/authenticate.ts';
import {
  authRateLimit,
  refreshRateLimit,
} from '#src/common/middleware/rate-limit.ts';
import { validate } from '#src/common/middleware/validate.ts';
import type { AccessTokenPayload } from '#src/common/utils/jwt.utils.ts';
import { sendCreated, sendSuccess } from '#src/common/utils/response.utils.ts';
import { AuditActions } from '#src/entities/AuditLog/index.ts';
import {
  type ChangePasswordRequest,
  ChangePasswordSchema,
  type LoginRequest,
  LoginSchema,
  type RefreshTokenRequest,
  RefreshTokenSchema,
  type RegisterRequest,
  RegisterSchema,
} from '#src/entities/Auth/index.ts';
import type { UserWithRole } from '#src/entities/User/index.ts';
import AuthService, { AuthMessages } from '#src/services/AuthService.ts';

const P = Paths.Auth;
const router = Router();

// 6.1.1 Registro (público + rate limit)
router.post(
  P.Register.PATH,
  authRateLimit,
  validate({ body: RegisterSchema }),
  async (req, res) => {
    const result = await AuthService.register(req.body as RegisterRequest);
    const registered = result.session?.user ?? result.user;
    if (registered) {
      // /auth no se audita por defecto; el autorregistro sí, con el propio
      // usuario nuevo como actor
      const audit: AuditOverride = {
        action: AuditActions.USER_REGISTERED,
        entityName: 'users',
        entityId: registered.id,
        userId: registered.id,
        metadata: { role: registered.role, isActive: registered.isActive },
      };
      res.locals.audit = audit;
    }
    if (result.isActive) {
      return sendCreated(res, result.session, AuthMessages.REGISTERED_ACTIVE);
    }
    return sendCreated(res, result.user, AuthMessages.REGISTERED_PENDING);
  },
);

// 6.1.2 Inicio de sesión (público + rate limit)
router.post(
  P.Login.PATH,
  authRateLimit,
  validate({ body: LoginSchema }),
  async (req, res) => {
    const session = await AuthService.login(req.body as LoginRequest);
    sendSuccess(res, session, AuthMessages.LOGGED_IN);
  },
);

// 6.1.3 Cierre de sesión (autenticado)
router.post(P.Logout.PATH, authenticate, async (req, res) => {
  const payload = res.locals.tokenPayload as AccessTokenPayload;
  const body = req.body as { refreshToken?: string } | undefined;
  await AuthService.logout(payload, body?.refreshToken);
  sendSuccess(res, null, AuthMessages.LOGGED_OUT);
});

// 6.1.4 Renovar token (público + rate limit)
router.post(
  P.Refresh.PATH,
  refreshRateLimit,
  validate({ body: RefreshTokenSchema }),
  async (req, res) => {
    const { refreshToken } = req.body as RefreshTokenRequest;
    const session = await AuthService.refresh(refreshToken);
    sendSuccess(res, session, AuthMessages.REFRESHED);
  },
);

// 6.1.5 Perfil propio (autenticado)
router.get(P.Me.PATH, authenticate, (_req, res) => {
  const user = res.locals.user as UserWithRole;
  sendSuccess(res, AuthService.me(user), AuthMessages.ME);
});

// 6.1.6 Cambiar contraseña (autenticado)
router.patch(
  P.ChangePassword.PATH,
  authenticate,
  validate({ body: ChangePasswordSchema }),
  async (req, res) => {
    const user = res.locals.user as UserWithRole;
    await AuthService.changePassword(user, req.body as ChangePasswordRequest);
    sendSuccess(res, null, AuthMessages.PASSWORD_CHANGED);
  },
);

export default router;
