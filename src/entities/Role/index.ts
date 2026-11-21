import type { Role } from '@prisma/client';

import type { RoleName } from '#src/entities/User/index.ts';

// Reexportamos la validación de parámetros de ruta (:id)
export { type IdParams, IdParamsSchema } from '#src/common/validation/rules.ts';

// ========================================================================= //
//                                 RESOURCE                                  //
// ========================================================================= //

/** RoleResource (contrato 5.4.3) */
export interface RoleResource {
  id: number;
  name: RoleName;
  description: string | null;
  createdAt: string;
}

/**
 * Convertir el registro de la BD en RoleResource (lista blanca de campos).
 */
export function toRoleResource(role: Role): RoleResource {
  return {
    id: role.id,
    name: role.name as RoleName,
    description: role.description ?? null,
    createdAt: role.createdAt.toISOString(),
  };
}
