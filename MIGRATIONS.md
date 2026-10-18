# Migrations, backup and recovery

`supabase/migrations/20261018134521_purl_durable_repository.sql` was generated with
Supabase CLI 2.121.0. It adds the document/CAS RPCs, normalized entity/audit tables,
indexes, explicit role grants/RLS and a private artifact bucket. It does not
modify existing application tables or copy local files into production. Its
Storage policies restrict access to this bucket for anonymous/authenticated
clients even when broader permissive policies already exist.
An existing public bucket with the same name causes the entire migration to
fail; review that collision and make the intended bucket private before retrying.

The additive upgrade `20261018152259_purl_skip_unchanged_projection_writes.sql`
retains the same RPC signature, invoker permissions and transaction semantics.
Both entity and audit projection upserts skip physical updates when JSON is
unchanged. The original migration is byte-preserved. Real PostgreSQL regression
records a failing baseline and passing upgrade in
`evidence/infrastructure/projection-write-amplification/`; production application
and unchanged-data/security checks are in
`evidence/deployment/database-reliability/upgrade.json`. The hosted migration
version is `20261018152346` (the bootstrap version is `20261018144237`), because
the management connector assigns application timestamps independently of local
filenames. Reconcile these names/versions before using CLI `db push` against this
already migrated production project; do not attempt to reapply the bootstrap.

## Apply

Prefer a dedicated project. The current hosted free quota required isolated, additive
PURL resources in the existing healthy project. Review the SQL and take the backup below before applying
it to an existing deployment. CLI usage was verified with `--help`; preserve an
explicit project/database selector rather than relying on whichever project is
currently linked.

```sh
npx --yes supabase@2.121.0 migration list --db-url "$PURL_DATABASE_URL"
npx --yes supabase@2.121.0 db push --db-url "$PURL_DATABASE_URL" --dry-run --skip-vault
npx --yes supabase@2.121.0 db push --db-url "$PURL_DATABASE_URL" --skip-vault
npx --yes supabase@2.121.0 migration list --db-url "$PURL_DATABASE_URL"
```

Supply the percent-encoded database URL from a protected operator environment;
avoid shell history and logs containing credentials. An alternative is applying
the reviewed transaction in the project's SQL editor, then reconciling CLI
migration history before later CLI deploys. Do not run both paths blindly.

The Data API must expose `public` and allow service-role execution of the two
RPCs. Table and function grants are explicit, including projects with Supabase's
2026 opt-in API exposure defaults. Browser roles receive no access. Run Supabase
database security/performance advisors against the actual project after applying;
the local PostgreSQL harness cannot substitute for hosted advisors.

Verify a read of a new document leaves `purl_documents` empty; then perform a
test command, check monotonically increasing revision, reject a stale revision,
restart the API/worker, and read the same result. Upload/download a helper
artifact and compare SHA-256 bytes before enabling production writes. Retain
proof of the project ID, migration revision, deployment revision and checks.

## Schema evolution

Never edit an applied migration. Generate a new migration with the pinned CLI,
test it locally and on staging, deploy additive columns/functions first, update
readers/writers next, and remove obsolete structures only in a later migration
after backup/retention windows. Keep RPC signatures compatible with the previous
deployed image during rollout. Transactions may rerun pure synchronous mutators
after CAS conflicts; network calls, emails, random IDs and external side effects
must be produced outside mutators or derived deterministically.

`purl_documents` is authoritative. `purl_entities` and `purl_audit` are maintained
in the same database transaction for indexed operational queries. Repair them
through a new validated CAS command or reviewed SQL rebuild, never by inventing
an alternate authority. One JSON document serializes all writes: this version
does not establish high-throughput scalability.

## Backup

1. Retain the exact image digest, source revision, migration list and runtime
   configuration names. Keep secret values in the deployment's secret manager.
2. Enable the appropriate Supabase database backups/PITR for the deployment's
   recovery objectives. For an operator-managed logical backup use a compatible
   `pg_dump` version with the database URL supplied through protected credential
   mechanisms. Capture schema and data for `public.purl_documents`,
   `public.purl_entities`, `public.purl_audit`, relevant migration history and
   grants/policies. Do not publish the dump; documents contain credential hashes,
   grants, private programs, inputs and execution state.
3. Back up actual bytes from the private `purl-artifacts` Storage bucket with a
   separately controlled object backup process. A Postgres backup of
   `storage.objects` contains metadata, not object bytes. Inventory object key,
   size and SHA-256; periodically restore and verify a sample.
4. For a consistent maintenance backup, pause mutating ingress and gracefully
   drain all workers before capturing database plus bucket inventory. Record the
   final document revision and UTC time, then resume. If writes remain live,
   retain all immutable objects covering the database recovery window and accept
   possible unreferenced objects for later reconciliation.

## Rollback and restore

For an application failure, drain workers, redeploy the previous compatible
image, and leave the additive schema intact. Do not drop tables/buckets or
decrement document revisions to undo a release. New commands restore behavior
while preserving audit/continuity history.

For data loss/corruption, stop all writers and restore into a fresh isolated
Supabase project first. Restore schema/grants/policies, the chosen database
snapshot and matching object bytes. Rebuild projections if necessary, verify
every referenced artifact hash, replay/version checks and permission boundaries,
then configure the API and workers to the restored project together. Reconcile
queued/leased jobs against the recovery point before restarting workers; expired
leases recover through normal CAS claims. Preserve the damaged project/dump as
evidence. Restore loses writes after the recovery point; announce that actual
window and reconcile external effects separately.

The initial migration is additive and has no automatic destructive down-script.
Rollback of deployment placement follows [DEPLOYMENT.md](DEPLOYMENT.md) and keeps
the same Supabase authority. Oracle placement does not require a database migration.

## Evidence limits

Local PostgreSQL verification covers SQL syntax, CAS, projections, read purity,
RLS/grants and restrictive private-bucket policies. Local PostgREST verification
covers the real adapter's HTTP/CAS path. Actual hosted Supabase REST/CAS, private Storage byte retrieval and hash checks,
copy recovery, and an isolated document restore in the same project passed; see
`evidence/deployment/hosted-backend/` and `evidence/deployment/hosted-storage/`.
Public records and native strict replay also survived restarting both Railway
services (`evidence/deployment/public-recovery/`). Cross-project disaster restore,
backup/PITR recovery and cross-provider failover remain NOT_RUN.
