import type { Role, User } from '@prisma/client';
import { z } from 'zod';

import { listQuery } from '#src/common/validation/list-query.ts';
import {
  boolean,
  booleanParam,
  email,
  id,
  idParam,
  Messages,
  password,
  personName,
  requiredText,
} from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const RoleNames = ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] as const;
export type RoleName = (typeof RoleNames)[number];

const roleName = () =>
  z.enum(RoleNames, {
    error: (issue) =>
      issue.input === undefined
        ? Messages.REQUIRED
        : 'El rol debe ser ADMIN, DOCENTE o ESTUDIANTE.',
  });

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** CreateUserRequest (contrato 5.5.5). Las llaves desconocidas se ignoran. */
export const CreateUserSchema = z
  .object({
    institutionalId: requiredText(30),
    firstName: personName(100),
    lastName: personName(120),
    email: email(150),
    password: password(),
    role: roleName(),
    instituteId: id(),
    careerId: id().nullable().optional(),
  })
  .superRefine((user, ctx) => {
    if (user.role !== 'ADMIN' && user.careerId == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['careerId'],
        message: 'La carrera es obligatoria para DOCENTE y ESTUDIANTE.',
      });
    }
  });
export type CreateUserRequest = z.infer<typeof CreateUserSchema>;

/**
 * UpdateUserRequest (contrato 5.5.6): todo es opcional y se envía solo lo
 * que cambia. No cambia contraseñas.
 */
export const UpdateUserSchema = z
  .object({
    institutionalId: requiredText(30).optional(),
    firstName: personName(100).optional(),
    lastName: personName(120).optional(),
    email: email(150).optional(),
    role: roleName().optional(),
    careerId: id().nullable().optional(),
    isActive: boolean().optional(),
  })
  .refine((user) => Object.keys(user).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
    path: ['body'],
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;

/** Filtros de GET /users (contrato 6.2.1) sobre ListQueryRequest. */
export const UserListQuerySchema = listQuery({
  sortable: ['lastName', 'createdAt'],
  defaultSort: 'lastName:asc',
}).extend({
  roleId: idParam().optional(),
  role: z
    .enum(RoleNames, 'El rol debe ser ADMIN, DOCENTE o ESTUDIANTE.')
    .optional(),
  careerId: idParam().optional(),
  instituteId: idParam().optional(),
  isActive: booleanParam().optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** UserResource (contrato 5.4.1): nunca incluye password, hash ni deletedAt. */
export interface UserResource {
  id: number;
  roleId: number;
  role: RoleName;
  instituteId: number;
  careerId: number | null;
  institutionalId: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserWithRole = User & { role: Role };

/**
 * Convertir el registro de la BD en UserResource (lista blanca de campos).
 */
export function toUserResource(user: UserWithRole): UserResource {
  return {
    id: user.id,
    roleId: user.roleId,
    role: user.role.name as RoleName,
    instituteId: user.instituteId,
    careerId: user.careerId,
    institutionalId: user.institutionalId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
