// Errors are carried as RFC 9457 problem details. Problem types are URNs so
// that PURL does not imply ownership of any web domain.

export class PurlError extends Error {
  constructor(status, type, detail, extra = {}) {
    super(detail);
    this.status = status;
    this.type = type;
    this.extra = extra;
  }
  toProblem(instance) {
    return {
      type: `urn:purl:problem:${this.type}`,
      title: TITLES[this.type] ?? this.type,
      status: this.status,
      detail: this.message,
      ...(instance ? { instance } : {}),
      ...this.extra,
    };
  }
}

const TITLES = {
  'bad-request': 'The request is malformed',
  'invalid-input': 'Operation input does not match its schema',
  unauthenticated: 'Authentication is required',
  forbidden: 'The requesting principal lacks the required authority',
  'not-found': 'No such resource, or it is not visible to you',
  'unknown-operation': 'The operation is not part of the protocol vocabulary',
  'version-conflict': 'The resource changed since the version you expected',
  'lifecycle-conflict': 'The operation is not permitted in the current lifecycle state',
  'merge-conflict': 'The merge has unresolved conflicts',
  'invariant-violation': 'The operation would violate a protocol invariant',
  'limit-exceeded': 'A resource limit was exceeded',
  'unsupported-media-type': 'Unsupported media type',
  'not-acceptable': 'No acceptable representation',
  'method-not-allowed': 'Method not allowed',
  'token-in-url': 'Credentials must not appear in URLs',
};

export const err = {
  badRequest: (d, x) => new PurlError(400, 'bad-request', d, x),
  invalidInput: (d, x) => new PurlError(422, 'invalid-input', d, x),
  unauthenticated: (d, x) => new PurlError(401, 'unauthenticated', d, x),
  forbidden: (d, x) => new PurlError(403, 'forbidden', d, x),
  notFound: (d, x) => new PurlError(404, 'not-found', d, x),
  unknownOperation: (d, x) => new PurlError(404, 'unknown-operation', d, x),
  versionConflict: (d, x) => new PurlError(409, 'version-conflict', d, x),
  lifecycleConflict: (d, x) => new PurlError(409, 'lifecycle-conflict', d, x),
  mergeConflict: (d, x) => new PurlError(409, 'merge-conflict', d, x),
  invariant: (d, x) => new PurlError(422, 'invariant-violation', d, x),
  limit: (d, x) => new PurlError(429, 'limit-exceeded', d, x),
};
