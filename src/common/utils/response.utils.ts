import type { Request, Response } from 'express';

import HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

/** Envoltura global de respuesta exitosa (contrato 5.4). */
export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationLinks {
  self: string;
  next: string | null;
  prev: string | null;
}

export interface PaginatedEnvelope<T> extends SuccessEnvelope<T[]> {
  meta: PaginationMeta;
  links: PaginationLinks;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const DefaultMessages = {
  OK: 'Operación completada correctamente.',
  CREATED: 'Recurso creado correctamente.',
  LIST: 'Resultados obtenidos correctamente.',
  DELETED: 'Recurso eliminado correctamente.',
} as const;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Responder con la envoltura `{ success, message, data }`.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = DefaultMessages.OK,
  status: HttpStatusCodes = HttpStatusCodes.OK,
) {
  const body: SuccessEnvelope<T> = { success: true, message, data };
  return res.status(status).json(body);
}

/**
 * Responder 201 con la envoltura.
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message: string = DefaultMessages.CREATED,
) {
  return sendSuccess(res, data, message, HttpStatusCodes.CREATED);
}

/**
 * Responder una colección paginada con `meta` y `links` (contrato 3.3 y 5.4).
 */
export function sendPage<T>(
  req: Request,
  res: Response,
  page: Page<T>,
  message: string = DefaultMessages.LIST,
) {
  const totalPages = Math.ceil(page.total / page.limit);
  const body: PaginatedEnvelope<T> = {
    success: true,
    message,
    data: page.items,
    meta: {
      total: page.total,
      page: page.page,
      limit: page.limit,
      totalPages,
    },
    links: {
      self: buildPageLink(req, page.page, page.limit),
      next:
        page.page < totalPages
          ? buildPageLink(req, page.page + 1, page.limit)
          : null,
      prev:
        page.page > 1 ? buildPageLink(req, page.page - 1, page.limit) : null,
    },
  };
  return res.status(HttpStatusCodes.OK).json(body);
}

/**
 * Ruta relativa con los mismos parámetros de consulta y otra página.
 */
function buildPageLink(req: Request, page: number, limit: number): string {
  const url = new URL(req.originalUrl, 'http://localhost');
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  return `${url.pathname}?${url.searchParams.toString()}`;
}
