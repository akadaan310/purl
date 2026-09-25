// Identifier generation. Identifiers carry a type prefix so that a client
// can tell a resource id from a principal id without context:
//   r_ resource   p_ principal   g_ grant   e_ event   i_ invocation   n_ entry
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

export function randomId(prefix, length = 10, bytes = randomBytes) {
  const buf = bytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i] % 32];
  return `${prefix}_${out}`;
}

/** Deterministic id generator for tests and reproducible experiments. */
export function sequentialIds() {
  const counters = new Map();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(6, '0')}`;
  };
}

export const ID_PATTERN = '^[a-z]_[0-9A-Z]{4,16}$|^purl-[a-z-]+$';
