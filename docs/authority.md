# Authority and ownership

## Model

```
principal ──holds──► authority source ──covers──► rights (+ optional operation allow-list)
                          │
                          ├── owner        (exactly one per resource; all rights + transfer)
                          ├── grant        (issued by owner or by another grant: a chain)
                          ├── public grant (grantee "*"; observe/read only)
                          └── admin        (instance-level; observe, archive/restore, revoke)
```

**Rights** are the atoms: `observe`, `read`, `append`, `update`, `assign`,
`link`, `lifecycle`, `grant`. Ownership transfer is a separate power that
is not a right and cannot be granted.

**Roles** are named bundles and nothing more:

| Role | Rights |
|------|--------|
| observer | observe |
| reader | observe, read |
| contributor | observe, read, append |
| operator | observe, read, append, update, assign, link |
| owner | all rights + transfer |

## Are the seven roles in the brief sufficient?

The brief listed *observer, reader, contributor, operator, delegate,
owner, administrator*. Investigating them showed they are **not one
dimension**:

- *observer … operator* differ by **which rights** are held. They are
  permission bundles.
- *delegate* describes **how authority arrived** (from another principal,
  for a purpose, possibly narrowed). A delegate can hold any bundle. In
  PURL a delegate is anyone whose authority source is a grant whose chain
  passes through someone other than the owner, or any grant with a
  `purpose`.
- *owner* is a **structural position** (exactly one per resource, the root
  of every chain).
- *administrator* is **instance-scoped**, not resource-scoped.

So the role list conflates three axes: *what you may do* (rights),
*where it came from* (provenance chain), and *at what scope* (resource vs.
instance). PURL keeps them separate. Bundles are merely convenient names
(`describeRights()` maps a right set back to a bundle name for display;
anything else is `custom`).

One gap was found: none of the listed roles covers "may change
lifecycle but not content" (e.g. a release manager). That is expressible
as rights `[observe, lifecycle]` — a custom set — which is why grants
accept explicit right lists, not only role names.

## Grants

```json
{
  "id": "g_…", "grantee": "p_…" | "*",
  "rights": ["observe","read","append"],
  "operations": ["append","checkpoint"] | null,
  "parent": "g_…" | null,
  "purpose": "run the calibration experiment" | null,
  "expires_at": "2026-10-01T00:00:00Z" | null,
  "granted_by": "p_…", "granted_at": "…", "version": 7,
  "revoked": null | { "by", "at", "version", "reason" }
}
```

### Attenuation (delegation can only narrow)

When a principal whose authority is a grant *G* issues a new grant *G′*:

- `G′.rights ⊆ G.rights` — else 403 `attenuation`.
- if `G.operations` is set, `G′.operations ⊆ G.operations` (and inherits
  it if omitted).
- `G′.expires_at ≤ G.expires_at` (clamped).
- `G′.parent = G`. The chain is therefore a path back to the owner.
- Only holders of the `grant` right can delegate at all.
- Public grants (`*`) are capped at `observe`/`read`.

This is the attenuation discipline of object-capability systems,
macaroons and UCAN, applied to server-held grants rather than bearer
tokens.

### Effectiveness and revocation

A grant is *effective* iff it and every ancestor are unrevoked and
unexpired. Revoking a grant therefore disables its whole subtree **without
writing to the descendants** — their records stay intact, so the history
of who could do what, when, remains readable.

Who may revoke: the owner (any grant), an admin (any grant), or a grant
holder (only grants descending from their own grant).

## One source per invocation

For each invocation the store looks for **one** source that covers all the
rights the plan needs *and* whose operation allow-list (if any) includes the
operation's name. Rights from different sources are never combined. The
chosen source is written onto every event:

```json
"authority": { "via": "grant", "grant": "g_000002", "chain": ["g_000002","g_000001"], "rights": [...] }
```

This is what "delegation does not erase provenance" means operationally:
for any event you can walk from the actor to the owner through recorded
grants, each with its issuer, time and version.

## Separation checklist (brief §10)

| Scenario | Outcome | Test |
|----------|---------|------|
| owner = A, observer = B | B can see metadata, cannot read content, cannot become owner | `authority.test.js` §10 scenario |
| delegated operator = C, restricted to `update`,`append` | C can update and append; cannot assign, grant, close or transfer | same |
| B reads the resource | no authority is created by reading | `reader cannot mutate` |
| C's delegator's grant revoked | C loses authority; C's grant record untouched | `revocation cascades` |
| ownership transferred A → B | A retains nothing implicitly | `ownership transfer…` |

## Not solved here

- **Grant survival across ownership transfer.** Grants issued by the
  previous owner remain effective after a transfer (the new owner can
  revoke them). Whether they *should* is a policy choice; recorded in
  RESEARCH_QUESTIONS.md.
- **Principal identity** is a server-issued bearer token. It proves "same
  token holder", not "same person/agent/model".
- **Consent to receive.** A handoff or grant does not require the
  recipient's acceptance; `acknowledge` exists but is not enforced.
