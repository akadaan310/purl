// A tiny deterministic algebra over bit strings. Pure functions only: no
// resources, no I/O. Every operation has an explicit JSON Schema for its
// operand list, so the same schema validator that guards PURL's wire formats
// guards evaluation. Declared algebraic properties are metadata for readers
// and tests; nothing here normalises expressions.
import { createHash } from 'node:crypto';
import { SchemaRegistry } from '../core/schema.js';
import { err } from '../core/errors.js';

export const COMPUTE = 'purl.compute/0.1';

export const VALUE_SCHEMA = { type: 'string', pattern: '^[01]{1,4096}$', description: 'A non-empty bit string; the constants are "0" and "1".' };

const operands = (n) => ({ type: 'array', minItems: n, maxItems: n, items: VALUE_SCHEMA });

const bitwise = (f) => ([a, b]) => {
  if (a.length !== b.length) throw err.invalidInput(`bitwise operands must have equal length (${a.length} ≠ ${b.length})`);
  let out = '';
  for (let i = 0; i < a.length; i++) out += f(a[i] === '1', b[i] === '1') ? '1' : '0';
  return out;
};

function sha256Bits(s) {
  const bytes = createHash('sha256').update(s, 'ascii').digest();
  let out = '';
  for (const b of bytes) out += b.toString(2).padStart(8, '0');
  return out;
}

export const OPERATIONS = Object.freeze({
  NOT: {
    arity: 1, input: operands(1), properties: ['involution'],
    description: 'Bitwise complement.',
    evaluate: ([a]) => [...a].map((c) => (c === '1' ? '0' : '1')).join(''),
  },
  AND: { arity: 2, input: operands(2), properties: ['commutative', 'associative', 'idempotent'], description: 'Bitwise AND of equal-length operands.', evaluate: bitwise((x, y) => x && y) },
  OR: { arity: 2, input: operands(2), properties: ['commutative', 'associative', 'idempotent'], description: 'Bitwise OR of equal-length operands.', evaluate: bitwise((x, y) => x || y) },
  XOR: { arity: 2, input: operands(2), properties: ['commutative', 'associative', 'self-inverse'], description: 'Bitwise XOR of equal-length operands.', evaluate: bitwise((x, y) => x !== y) },
  CONCAT: {
    arity: 2, input: { ...operands(2), description: 'Total length at most 4096.' }, properties: ['associative'],
    description: 'Concatenation of two bit strings.',
    evaluate: ([a, b]) => {
      if (a.length + b.length > 4096) throw err.invalidInput('CONCAT result exceeds 4096 bits');
      return a + b;
    },
  },
  HASH: {
    arity: 1, input: operands(1), properties: [],
    description: 'SHA-256 of the operand\'s ASCII characters, as a 256-character bit string.',
    evaluate: ([a]) => sha256Bits(a),
  },
});

export const OPERATION_NAMES = Object.keys(OPERATIONS);

const registry = new SchemaRegistry();

/** Evaluate `op` over operand values. Throws invalid-input on unknown operations or bad operands. */
export function evaluate(op, values) {
  const spec = OPERATIONS[op];
  if (!spec) throw err.invalidInput(`unknown operation "${op}"; known: ${OPERATION_NAMES.join(', ')}`);
  const errors = registry.validate(spec.input, values);
  if (errors.length) throw err.invalidInput(`operands do not match the input schema of ${op}`, { errors });
  return spec.evaluate(values);
}

/** Publishable description of the algebra (no functions). */
export function describeAlgebra() {
  return {
    compute: COMPUTE,
    value: VALUE_SCHEMA,
    operations: Object.fromEntries(Object.entries(OPERATIONS).map(([name, o]) => [name, { arity: o.arity, input: o.input, properties: o.properties, description: o.description }])),
    normalisation: 'none — expressions are never rewritten; properties are declared, not applied',
  };
}
