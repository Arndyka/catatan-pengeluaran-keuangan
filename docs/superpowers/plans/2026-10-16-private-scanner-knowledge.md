# Private scanner knowledge implementation plan

**Goal:** Consolidate the user's local bank statements into private, reusable scanner examples without counting duplicates or silently changing the ledger.

**Architecture:** Read native PDF text locally, use OCR only for image pages, validate statement totals and running balances, and consolidate equivalent entire statements. Store the resulting examples separately from transactions under the authenticated account. Unreviewed categories remain unlabelled; only user-confirmed categories train local suggestions. No NVIDIA/LLM calls.

**Execution:** Inline. User authorized document reading, deduplication, account access, and knowledge seeding. User also authorized importing unique transactions; own e-wallet/Krom movements are confirmed. Unclear loan splits and economic purposes remain pending in clearing.

- [x] Add/test pure consolidation using bank, account, period, opening/closing totals and ordered complete transaction facts. Preserve repeated legitimate rows and provenance of every source.
- [x] Produce an ignored private dataset and duplicate report from all supplied PDFs. Never delete originals or include samples/credentials in Git.
- [x] Save and read back private account knowledge separately from the ledger; compare transaction collection before/after.
- [x] Connect local example lookup/category suggestions and a visible knowledge summary to the scanner. Unverified examples cannot train categorical predictions or alter financial facts.
- [x] Disable LLM calls in the user-facing flow. Test native PDF, OCR, knowledge isolation, ambiguous matches and duplicate imports.
Release step: publish only verified application code and documentation; report private data counts and limitations in the user handoff.

Review focus: identical amounts within a statement are not duplicates; different accounts never collapse; unbalanced statements cannot enter the verified corpus; importing the same corpus twice is idempotent; source-only examples never masquerade as reviewed training labels.

Verification: 106 Node tests and 29 browser scenarios passed. Private bulk-data UI checks passed at phone and desktop widths. Independent review found no remaining material blockers.
