// Communication profiles: a specification of observable communication
// characteristics. `measure()` implements the documented stylometric
// function purl.stylometry/0.1. It measures text; it does not capture — and
// the profile does not transfer — identity, memory or model state.

export const DISCLAIMER = 'This profile specifies observable communication characteristics. It does not transfer identity, memory, consciousness, or model state.';

const round = (x) => Math.round(x * 1000) / 1000;

/** purl.stylometry/0.1 — every feature is a ratio or mean over a text sample. */
export function measure(text) {
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const fences = lines.filter((l) => l.trim().startsWith('```')).length;
  const prose = text.replace(/```[\s\S]*?```/g, ' ');
  const sentences = prose.split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /\w/.test(s));
  const words = prose.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const lengths = sentences.map((s) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const sd = lengths.length ? Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length) : 0;
  return {
    method: 'purl.stylometry/0.1',
    corpus_chars: text.length,
    sentences: sentences.length,
    words: words.length,
    sentence_length_mean: round(mean),
    sentence_length_sd: round(sd),
    mean_word_length: round(words.length ? words.reduce((a, w) => a + w.length, 0) / words.length : 0),
    // Type-token ratio depends strongly on sample length; compare only equal-length samples.
    type_token_ratio: round(words.length ? new Set(words).size / words.length : 0),
    question_ratio: round(sentences.length ? sentences.filter((s) => s.endsWith('?')).length / sentences.length : 0),
    exclamation_ratio: round(sentences.length ? sentences.filter((s) => s.endsWith('!')).length / sentences.length : 0),
    list_line_ratio: round(nonEmpty.length ? nonEmpty.filter((l) => /^\s*([-*+]|\d+[.)])\s/.test(l)).length / nonEmpty.length : 0),
    heading_line_ratio: round(nonEmpty.length ? nonEmpty.filter((l) => /^\s*#{1,6}\s/.test(l)).length / nonEmpty.length : 0),
    code_fence_ratio: round(nonEmpty.length ? fences / nonEmpty.length : 0),
  };
}

/** Build a profile from optional declared characteristics and an optional text sample. */
export function buildProfile({ declared = null, sample = null } = {}) {
  const measured = sample ? measure(sample) : null;
  const source = declared && measured ? 'mixed' : measured ? 'measured' : 'declared';
  return {
    schema: 'purl.communication-profile/0.1',
    scope: 'observable-communication-characteristics',
    source,
    ...(declared ? { declared } : {}),
    measured,
    disclaimer: DISCLAIMER,
  };
}
