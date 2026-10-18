# Historical Railway configuration

These files preserve the initial service-level Config as Code examples byte for
byte. They are historical references and must not be configured as active service
config paths. The root `railway.toml` was removed to prevent its API command from
overriding the worker when both services attach to the same repository.

Railway's [current documentation](https://docs.railway.com/infrastructure-as-code#iac-vs-config-as-code)
states: “Config as Code (`railway.json` / `railway.toml`) is deprecated.
Infrastructure as Code is the replacement.” Setup also observed the live MCP
rejecting `railwayConfigFile`. Current direct MCP settings are recorded in
[railway-services.json](../railway-services.json); native IaC import/plan/apply
has not been performed.

| Historical file | Original path | SHA-256 |
| --- | --- | --- |
| `railway-api.legacy.toml` | `railway.toml` | `5c4e2bbf3c6ae227a95aeec0d92915ecc89cbb339a61f71f4310dbf8ee0b4a6a` |
| `railway-worker.legacy.toml` | `deploy/railway-worker.toml` | `7648b16539fa39e89edea53b6493bccd86aba27e4cdbdd475f37853009feb47d` |
