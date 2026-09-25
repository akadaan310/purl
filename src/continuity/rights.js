// Rights are the atoms of authority. Roles are named bundles of rights and
// carry no power of their own: the authorisation check only ever looks at
// rights (plus an optional operation allow-list on grants).

export const RIGHTS = Object.freeze({
  observe: 'See that the resource exists, its metadata, manifest and event headers (no payloads).',
  read: 'See full state, collections, grants, event payloads, checkpoints and diffs.',
  append: 'Add entries to collections (findings, annotations, checkpoints, acknowledgements). Never removes or edits.',
  update: 'Change the free-form state object (JSON Merge Patch).',
  assign: 'Change who is responsible for continuing the work (assignee). Never changes ownership.',
  link: 'Record typed relations from this resource to others (references, supersedes, merged_from).',
  lifecycle: 'Move the resource through its lifecycle (close, complete, cancel, reopen, archive, restore).',
  grant: 'Issue grants of rights the holder already has (attenuation), and revoke grants descending from them.',
});

export const RIGHT_NAMES = Object.keys(RIGHTS);

/** Permission bundles. `delegate` and `administrator` are NOT bundles — see docs/authority.md. */
export const ROLES = Object.freeze({
  observer: ['observe'],
  reader: ['observe', 'read'],
  contributor: ['observe', 'read', 'append'],
  operator: ['observe', 'read', 'append', 'update', 'assign', 'link'],
  owner: [...RIGHT_NAMES], // plus the non-grantable ownership-transfer power
});

/** Instance administrators may keep an instance healthy without reading or editing content. */
export const ADMIN_RIGHTS = ['observe', 'lifecycle', 'grant'];
export const ADMIN_OPERATIONS = ['archive', 'restore', 'revoke'];

/** The public principal. A grant to '*' applies to every requester, authenticated or not. */
export const PUBLIC = '*';
export const PUBLIC_MAX_RIGHTS = ['observe', 'read'];

export function expandRights(rightsOrRole) {
  if (typeof rightsOrRole === 'string') {
    const r = ROLES[rightsOrRole];
    if (!r) throw new Error(`unknown role ${rightsOrRole}`);
    return [...r];
  }
  return [...new Set(rightsOrRole)].sort();
}

/** Which named bundle (if any) a set of rights equals — purely descriptive. */
export function describeRights(rights) {
  const set = [...new Set(rights)].sort().join(',');
  for (const [name, r] of Object.entries(ROLES)) if ([...r].sort().join(',') === set) return name;
  return 'custom';
}

export const isSubset = (a, b) => a.every((x) => b.includes(x));
