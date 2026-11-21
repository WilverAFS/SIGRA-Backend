import { NotFoundError } from '#src/common/classes/route-errors.ts';
import { type RoleResource, toRoleResource } from '#src/entities/Role/index.ts';
import RoleRepo from '#src/repos/RoleRepo.ts';

export const RoleMessages = {
  LISTED: 'Roles obtenidos correctamente.',
  FOUND: 'Rol obtenido correctamente.',
  NOT_FOUND: 'El rol no existe.',
} as const;

async function list(): Promise<RoleResource[]> {
  const roles = await RoleRepo.findAll();
  return roles.map(toRoleResource);
}

async function getOne(id: number): Promise<RoleResource> {
  const role = await RoleRepo.findById(id);
  if (!role) throw new NotFoundError(RoleMessages.NOT_FOUND);
  return toRoleResource(role);
}

export default {
  list,
  getOne,
} as const;
