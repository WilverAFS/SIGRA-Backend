import { z } from 'zod';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const PAGE_DEFAULT = 1;
export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 100;

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

export type SortDirection = 'asc' | 'desc';

export interface ListQuery<F extends string = string> {
  page: number;
  limit: number;
  search?: string;
  sort: { field: F; direction: SortDirection };
}

interface ListQueryOptions<F extends string> {
  /** Campos ordenables declarados por el endpoint. */
  sortable: readonly [F, ...F[]];
  /** Orden por defecto del recurso. */
  defaultSort: `${F}:${SortDirection}`;
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * ListQueryRequest (contrato 3.3 y 5.5.15): `page`, `limit`, `sort` y
 * `search`. Un valor mayor a 100 en `limit` se ajusta a 100; un `sort` con
 * campo no declarado o un valor inválido responde 422.
 *
 * Los filtros propios de cada colección se agregan con `.extend({...})`.
 * Los filtros desconocidos se ignoran (zod descarta las llaves extra).
 */
export function listQuery<F extends string>(options: ListQueryOptions<F>) {
  const sortPattern = new RegExp(
    `^(${options.sortable.join('|')}):(asc|desc)$`,
  );
  return z.object({
    page: z
      .string()
      .regex(/^[1-9][0-9]*$/, 'page debe ser un entero mayor o igual a 1.')
      .transform(Number)
      .optional()
      .default(PAGE_DEFAULT),
    limit: z
      .string()
      .regex(/^[1-9][0-9]*$/, 'limit debe ser un entero entre 1 y 100.')
      .transform((value) => Math.min(Number(value), LIMIT_MAX))
      .optional()
      .default(LIMIT_DEFAULT),
    search: z
      .string()
      .trim()
      .max(100, 'search debe tener como máximo 100 caracteres.')
      .optional()
      .transform((value) => (value ? value : undefined)),
    sort: z
      .string()
      .regex(
        sortPattern,
        `sort debe tener el formato campo:asc o campo:desc. Campos permitidos: ${options.sortable.join(', ')}.`,
      )
      .optional()
      .default(options.defaultSort)
      .transform((value) => {
        const [field, direction] = value.split(':') as [F, SortDirection];
        return { field, direction };
      }),
  });
}

/**
 * `skip`/`take` de Prisma a partir de la página.
 */
export function toSkipTake(query: Pick<ListQuery, 'page' | 'limit'>) {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}
