import { secureRandomInt } from './secure-random';

/**
 * Generated passwords for new accounts (developer console).
 *
 * 16 characters drawn uniformly from a 66-character alphabet with the
 * browser's cryptographic RNG: about 96 bits of entropy. Look-alike
 * characters (0/O, 1/l/I) are left out so a password read aloud or copied by
 * hand survives. Every result contains an upper-case letter, a lower-case
 * letter, a digit and a symbol, which directory password policies expect.
 */
export const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*-_=+';
export const DEFAULT_PASSWORD_LENGTH = 16;
export const MIN_PASSWORD_LENGTH = 16;

const CLASSES = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];

export function generateStrongPassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
  const size = Math.max(MIN_PASSWORD_LENGTH, Math.floor(length) || 0);
  for (;;) {
    let password = '';
    for (let i = 0; i < size; i++) {
      password += PASSWORD_ALPHABET[secureRandomInt(PASSWORD_ALPHABET.length)];
    }
    if (CLASSES.every((re) => re.test(password))) return password;
  }
}

/** Numeric PIN from the cryptographic RNG (for flows that explicitly want digits). */
export function generatePin(length = 6): string {
  let pin = '';
  for (let i = 0; i < Math.max(1, Math.floor(length) || 0); i++) {
    pin += String(secureRandomInt(10));
  }
  return pin;
}

/** Bits of entropy for a password of `length` drawn uniformly from the alphabet. */
export function passwordEntropyBits(length: number = DEFAULT_PASSWORD_LENGTH): number {
  return length * Math.log2(PASSWORD_ALPHABET.length);
}
