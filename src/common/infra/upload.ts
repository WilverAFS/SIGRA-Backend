import type { MaterialVersion } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { RouteError } from '#src/common/classes/route-errors.ts';
import { Env } from '#src/common/constants/env.constants.ts';
import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import HttpStatusCodes from '#src/common/constants/HttpStatusCodes.ts';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

/** Tamaño máximo del contrato 5.3: 25 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Extensión → MIME detectado. Deben coincidir (contrato 5.3). */
const ALLOWED_FILE_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const TYPE_NOT_ALLOWED = new RouteError(
  ErrorCodes.FILE_TYPE_NOT_ALLOWED,
  'Tipo de archivo no permitido. Use PDF, Word, PowerPoint o Excel.',
);

// ========================================================================= //
//                                   TYPES                                    //
// ========================================================================= //

export interface SavedUpload {
  originalFileName: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

function extensionOf(fileName: string): string {
  return extname(basename(fileName)).toLowerCase();
}

/** El nombre original se sanea solo para la cabecera de descarga. */
export function safeFileName(fileName: string): string {
  const clean = basename(fileName)
    .replace(/["\\\r\n]/g, '_')
    .trim();
  return clean.length > 0 ? clean.slice(0, 255) : 'descarga';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = extensionOf(file.originalname);
    if (ALLOWED_FILE_TYPES[extension] === file.mimetype.toLowerCase()) {
      callback(null, true);
    } else {
      // Rechazar con error: descartar el archivo lo convertiría en 400
      // (falta `file`) en lugar del 415 FILE_TYPE_NOT_ALLOWED del contrato.
      callback(TYPE_NOT_ALLOWED);
    }
  },
});

/**
 * Transforma los errores de multer a códigos del catálogo 4.3. El filtro de
 * tipo se reporta como 415 y el exceso de tamaño como 413.
 */
export function uploadSingleFile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof RouteError) return next(err);
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new RouteError(
          ErrorCodes.FILE_TOO_LARGE,
          `El archivo supera el límite de ${MAX_UPLOAD_BYTES} bytes (25 MB).`,
        ),
      );
    }
    return next(
      new RouteError(
        ErrorCodes.BAD_REQUEST,
        'La petición multipart/form-data no es válida.',
      ),
    );
  });
}

function uploadDir(): string {
  return resolve(process.cwd(), Env.UPLOAD_DIR);
}

/**
 * Guarda el archivo con un nombre interno no adivinable y devuelve los
 * metadatos que calcula el backend (nunca los envía el cliente).
 */
export async function saveUpload(file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<SavedUpload> {
  const extension = extensionOf(file.originalname);
  if (ALLOWED_FILE_TYPES[extension] !== file.mimetype.toLowerCase()) {
    throw TYPE_NOT_ALLOWED;
  }

  const directory = uploadDir();
  await mkdir(directory, { recursive: true });
  const storagePath = join(directory, `${randomUUID()}${extension}`);
  await writeFile(storagePath, file.buffer);

  return {
    originalFileName: safeFileName(file.originalname),
    storagePath,
    mimeType: file.mimetype.toLowerCase(),
    fileSizeBytes: file.buffer.byteLength,
    checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
  };
}

export async function removeUpload(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch {
    // La limpieza es best-effort: no debe fallar la operación principal.
  }
}

function unavailable(): RouteError {
  return new RouteError(
    ErrorCodes.INTERNAL_ERROR,
    'El almacenamiento de archivos no está disponible.',
    undefined,
    HttpStatusCodes.SERVICE_UNAVAILABLE,
  );
}

/** Comprueba antes de contar la descarga que el binario sigue accesible. */
export async function assertUploadAvailable(
  storagePath: string,
): Promise<void> {
  try {
    await access(storagePath);
  } catch {
    throw unavailable();
  }
}

/** Descarga por streaming; solo la respuesta exitosa es binaria. */
export function streamUpload(res: Response, version: MaterialVersion): void {
  res.setHeader('Content-Type', version.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeFileName(version.originalFileName)}"`,
  );
  res.setHeader('Content-Length', version.fileSizeBytes.toString());

  const stream = createReadStream(version.storagePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(HttpStatusCodes.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'El almacenamiento de archivos no está disponible.',
        data: null,
        error: { code: ErrorCodes.INTERNAL_ERROR },
      });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

export default uploadSingleFile;
