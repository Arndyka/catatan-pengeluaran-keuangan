# Native e-statement formats implementation plan

**Goal:** Read the supplied blu, Mandiri consolidated, and myBCA main-account PDFs accurately.
**Architecture:** Keep PDF.js local extraction and the existing review/save flow. Add dedicated native layout readers in scanner.js, with issuer detection and document metadata. Reuse reconciliation and explicit user review for uncertain own-account transfers.
**Tech stack:** Browser JavaScript, PDF.js, Node test runner, Playwright; local PDF samples excluded from Git.
**Execution:** Inline, following systematic debugging and red/green regression tests.

- [x] Add synthetic token fixtures reproducing blu signed amounts/cents/period ranges and Mandiri consolidated two-digit dates, D markers, and page continuations. Confirm failures.
- [x] Implement issuer detection, native readers, metadata and informational-page classification in assets/js/scanner.js. Preserve original descriptions and explicit references; never treat account numbers as references.
- [x] Verify every available PDF locally against printed opening/closing balances, totals, transaction rows, and continuation text. Never save sample transactions to the user's ledger or send documents to AI.
- [x] Check encrypted PDF workflow, sub-rupiah amounts, duplicate matching, and mobile review in the browser. Run unit suite and targeted browser regressions.
- [x] Document supported formats and limitations. Commit only source, synthetic tests, and documentation; publish the verified frontend to GitHub Pages.

Review focus: informational/card-summary pages must not create transactions; debit sign comes from the amount column; wrapped text across pages belongs to its original row; cents must reconcile; unknown transfer destinations need review. The myBCA folder was initially empty; seven PDFs subsequently arrived and were included. Empty Poket Rupiah appendices preserve main-account totals; populated pocket statements remain unverified.

Verification: 98 Node tests and 25 browser scenarios passed. All 16 private PDFs (80 pages, 638 rows including repeated May statements) reconciled exactly to cents, with zero row mismatches and no OCR/AI. Actual encrypted-PDF UI and cleared password verified. Identical May copy: 17 duplicates; different file version: 17 review items, none selected. No sample transactions posted. Independent review found and resolved a wrapped blu owner-name issue; follow-up review found no further actionable defects.
