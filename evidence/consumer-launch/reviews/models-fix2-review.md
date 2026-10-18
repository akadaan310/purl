# Task 05 — narrow second-fix review

Spec verdict: **PASS (scoped)**.

Code quality verdict: **APPROVED (scoped)**.

The remaining P2 from `models-fix1-review.md` is **ADDRESSED**. No new breakage identified in the narrow second-fix diff. This closes the remaining rejected-output reconciliation finding; the escaped-output capacity and atomic object-quota findings retain their earlier addressed dispositions.

## Review evidence

Reviewed `rejection-hash-fix.patch`, the current affected response-parsing/result-construction code, the new regression and its local HTTP fixture setup, and the retained red/green/final test outputs. No covered tests were rerun and no new probes, network calls, implementation edits, or commits were performed in this review.

- The hash now consumes the response buffer already bounded to 131,072 bytes, eliminating recursive serialization of non-string provider content. Buffer availability is guaranteed by the successful parse path. The remaining string serialization calls operate only on primitive strings.
- `hashSource: 'provider-response-bytes'` states the changed digest meaning explicitly, with response byte length recorded. The raw response is not persisted. The result remains bounded and storage-compatible, allowing independently parsed usage/cost to reach `finish()`.
- The red evidence reproduces the prior `RangeError` at the rejection-hash expression. Green evidence passes the exact new regression. The regression sends 10,000 nested arrays through a real local HTTP fixture, asserts two terminal `PROVIDER_OUTPUT_REJECTED` responses, persisted `output_rejected`, cost 40 USD-micro, reserved 0, and one provider-fixture dispatch.
- The retained final scoped suite reports **27 passed / 0 failed / 0 skipped**. This is inspected implementer evidence, not an independently rerun suite.

Actual live provider inference and model-performance comparison remain **NOT_RUN**. Local HTTP fixture success does not establish either.

Review snapshot SHA-256:

- `service/launch/models.js`: `57413f5cca5782aee38ff2c8a4ef472b96614d222701cd099bd9934f9e46e13e`
- `rejection-hash-fix.patch`: `62dcf2b9c066b270fe3edb06e2a741d2ce38d2dc5e4e428fb6b73e3ae73300ae`
