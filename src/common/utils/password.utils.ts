import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Hash de contraseña con scrypt (módulo nativo de Node, sin dependencias).
 * Formato guardado en `password_hash`: `scrypt$<salt hex>$<hash hex>`.
 * La contraseña nunca se guarda ni se devuelve en texto plano (contrato 2.1).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verificar una contraseña contra su hash (lo usará el login, 6.1.2).
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [prefix, saltHex, hashHex] = stored.split('$');
  if (prefix !== PREFIX || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  return timingSafeEqual(expected, actual);
}
