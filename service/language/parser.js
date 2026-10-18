import { LIMITS, TYPES, fail, isRecord, validateValue, exactKeys } from './values.js';

// Splitting respects JSON strings and nesting, so a quoted pipe is data.
function splitPipeline(source) {
  const parts = [];
  let quote = false, escaped = false, level = 0, start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true;
    else if ('[{('.includes(c)) level++;
    else if (']})'.includes(c)) { level--; if (level < 0) fail('parse', 'SYNTAX', 'Unmatched closing delimiter'); }
    else if (c === '|' && level === 0) { parts.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (quote || level !== 0) fail('parse', 'SYNTAX', 'Unclosed string or delimiter');
  parts.push(source.slice(start).trim());
  if (parts.some(part => !part)) fail('parse', 'SYNTAX', 'Empty pipeline stage');
  return parts;
}

function dslSteps(raw, depth = 0) {
  if (depth > LIMITS.depth) fail('normalize', 'DEPTH', 'Program nesting limit exceeded');
  return splitPipeline(raw).map(part => {
    const repeat = /^repeat\s+(\d+)\s*\{([\s\S]*)\}$/.exec(part);
    if (repeat) return { repeat: { count: Number(repeat[1]), steps: dslSteps(repeat[2].trim(), depth + 1) } };
    const match = /^([A-Za-z][A-Za-z0-9_.-]*)(?:@([^\s]+))?(?:\s+([\s\S]+))?$/.exec(part);
    if (!match) fail('parse', 'SYNTAX', `Expected an operator or bounded repeat: ${part.slice(0, 80)}`);
    let args = {};
    if (match[3]) {
      let value;
      try { value = JSON.parse(match[3]); } catch { fail('parse', 'SYNTAX', 'Operator arguments must be JSON (quote string literals)'); }
      args = isRecord(value) ? value : { value };
    }
    return { op: match[1], ...(match[2] ? { version: match[2] } : {}), args };
  });
}

export function parse(source) {
  if (typeof source === 'string') {
    if (Buffer.byteLength(source, 'utf8') > LIMITS.sourceBytes) fail('parse', 'SOURCE_QUOTA', 'Source byte limit exceeded');
    const trimmed = source.trim();
    if (!trimmed) fail('parse', 'SYNTAX', 'Source is empty');
    if (trimmed.startsWith('{')) {
      try { source = JSON.parse(trimmed); } catch { fail('parse', 'SYNTAX', 'Malformed JSON source'); }
    } else {
      const stages = splitPipeline(trimmed);
      const header = /^input\s+([a-z]+)$/.exec(stages[0]);
      source = { language: 'purl/1', input: header ? header[1] : 'json', steps: header ? stages.length > 1 ? dslSteps(stages.slice(1).join(' | ')) : [] : dslSteps(trimmed) };
    }
  }
  try { validateValue(source, { bytes: LIMITS.sourceBytes, depth: LIMITS.depth, arrayLength: LIMITS.arrayLength }); }
  catch (error) { fail('parse', error.code, error.message); }
  exactKeys(source, ['language', 'input', 'steps']);
  if (source.language !== undefined && source.language !== 'purl/1') fail('parse', 'LANGUAGE_VERSION', 'Supported source language is purl/1');
  const input = source.input || 'json';
  if (!TYPES.includes(input)) fail('type', 'UNKNOWN_TYPE', `Unknown input type: ${input}`);
  if (!Array.isArray(source.steps)) fail('parse', 'SHAPE', 'Source requires a steps array');
  return { language: 'purl/1', input, steps: source.steps };
}
