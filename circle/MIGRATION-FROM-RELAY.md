# Migration from Relay

The migration artifact belongs to the system it describes. It lives in the ACSP
repository, beside the code and the snapshot it hashes:

* `NetGovComEduGovOrgEduGovComNet/MIGRATION-FROM-RELAY.md` (commit `29b4911`)
* `NetGovComEduGovOrgEduGovComNet/migration/relay-gen1/` (live resource `8N2RXG1MW79S` @ v12, `manifest.json` with sha256 per file)

In summary: ACSP/0.1 is generation 1 of the continuity lineage and is unchanged.
The circle consumes it through `AcspAdapter`. The 7 pending field-trial
proposals stay pending, because resolving them is the owner's authority.
