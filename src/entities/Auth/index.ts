import { z } from 'zod';

import {
  email,
  id,
  password,
  personName,
  requiredText,
} from '#src/common/validation/rules.ts';
import type { UserResource } from '#src/entities/User/index.ts';

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** 5.5.1 LoginRequest */
export const LoginSchema = z.object({
  email: email(150),
  password: requiredText(128),
});
export type LoginRequest = z.infer<typeof LoginSchema>;

/** 5.5.2 RegisterRequest (solo ESTUDIANTE y DOCENTE; careerId obligatorio) */
export const RegisterSchema = z.object({
  institutionalId: requiredText(30),
  firstName: personName(100),
  lastName: personName(120),
  email: email(150),
  password: password(),
  role: z.enum(['ESTUDIANTE', 'DOCENTE'], {
    error: () => 'El rol debe ser ESTUDIANTE o DOCENTE.',
  }),
  instituteId: id(),
  careerId: id(),
});
export type RegisterRequest = z.infer<typeof RegisterSchema>;

/** 5.5.3 RefreshTokenRequest */
export const RefreshTokenSchema = z.object({
  refreshToken: requiredText(500),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

/** 5.5.4 ChangePasswordRequest */
export const ChangePasswordSchema = z
  .object({
    currentPassword: requiredText(128),
    newPassword: password(),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser distinta de la contraseña actual.',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** AuthSessionResource (contrato 5.4.2; en /refresh omite `user`) */
export interface AuthSessionResource {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user?: UserResource;
}
