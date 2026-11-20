import { z } from 'zod';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

/**
 * Reglas de validación compartidas (contrato 5.2 y actualización del
 * 2026-11-18). El frontend aplica exactamente las mismas en
 * `src/utils/validaciones.ts`.
 */
export const Messages = {
  REQUIRED: 'Este campo es obligatorio.',
  STRING: 'Debe ser un texto.',
  INTEGER: 'Debe ser un número entero.',
  POSITIVE_INTEGER: 'Debe ser un número entero mayor que 0.',
  BOOLEAN: 'Debe ser true o false.',
  EMAIL: 'El correo no tiene un formato válido.',
  ONLY_LETTERS:
    'Solo se permiten letras (acentos, ñ y ü) y espacios simples, sin números, guiones ni apóstrofos.',
  PASSWORD:
    'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.',
  maxLength: (max: number) => `Debe tener como máximo ${max} caracteres.`,
} as const;

/** Letras (incluidos acentos, ñ y ü) separadas por un solo espacio. */
export const NAME_REGEX =
  /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+( [A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/;

/** Al menos una mayúscula, una minúscula, un número y un símbolo. */
const PASSWORD_RULES = [
  /[A-ZÁÉÍÓÚÑÜ]/,
  /[a-záéíóúñü]/,
  /[0-9]/,
  /[^A-Za-z0-9]/,
];
export const PASSWORD_MIN_LENGTH = 8;

// ========================================================================= //
//                                  SCHEMAS                                  //
// ========================================================================= //

/** Mensaje de "obligatorio" cuando falta el campo; de tipo en otro caso. */
const typeError = (message: string) => ({
  error: (issue: { input: unknown }) =>
    issue.input === undefined ? Messages.REQUIRED : message,
});

/** Texto obligatorio, sin espacios al inicio o al final, con largo máximo. */
export const requiredText = (max: number) =>
  z
    .string(typeError(Messages.STRING))
    .trim()
    .min(1, Messages.REQUIRED)
    .max(max, Messages.maxLength(max));

/** Nombre o apellidos: solo letras y espacios simples. */
export const personName = (max: number) =>
  requiredText(max).regex(NAME_REGEX, Messages.ONLY_LETTERS);

/** Correo con formato válido (la unicidad se valida contra la BD → 409). */
export const email = (max = 150) =>
  z
    .string(typeError(Messages.STRING))
    .trim()
    .toLowerCase()
    .min(1, Messages.REQUIRED)
    .max(max, Messages.maxLength(max))
    .pipe(z.email(Messages.EMAIL));

/** Contraseña: mínimo 8, mayúscula, minúscula, número y símbolo. */
export const password = () =>
  z
    .string(typeError(Messages.STRING))
    .min(1, Messages.REQUIRED)
    .refine(
      (value) =>
        value.length >= PASSWORD_MIN_LENGTH &&
        PASSWORD_RULES.every((rule) => rule.test(value)),
      Messages.PASSWORD,
    );

/** Identificador numérico en el cuerpo (JSON). */
export const id = () =>
  z
    .number(typeError(Messages.INTEGER))
    .int(Messages.INTEGER)
    .positive(Messages.POSITIVE_INTEGER);

/** Identificador numérico en la ruta o la query (llega como texto). */
export const idParam = () =>
  z
    .string(typeError(Messages.POSITIVE_INTEGER))
    .regex(/^[1-9][0-9]*$/, Messages.POSITIVE_INTEGER)
    .transform(Number)
    .pipe(z.number().max(2147483647, Messages.POSITIVE_INTEGER));

/** Booleano en el cuerpo (JSON). */
export const boolean = () => z.boolean(typeError(Messages.BOOLEAN));

/** Booleano en la query: solo `true` o `false`. */
export const booleanParam = () =>
  z
    .enum(['true', 'false'], Messages.BOOLEAN)
    .transform((value) => value === 'true');

/** `{ id }` en la ruta, para GET/PATCH/DELETE de un recurso individual. */
export const IdParamsSchema = z.object({ id: idParam() });
export type IdParams = z.infer<typeof IdParamsSchema>;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Validar un valor suelto con una regla y devolver `null` o el mensaje de
 * error, con la misma forma que las funciones del frontend.
 */
export function check(schema: z.ZodType, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}
