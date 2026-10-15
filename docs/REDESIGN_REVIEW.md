# Spendly redesign review — 15 Oktober 2026

## Delivered

The local SPENDLY app now has a coral/plum design, mobile navigation, desktop sidebar, light/dark themes, restrained animations and reduced-motion support. Dashboard calculations use real journals; only explicit demo mode seeds sample data.

New planning features: monthly spending ceiling and daily remaining allowance; manually tracked savings goals with create/edit/delete; wallets including zero balances; recorded investment balances and allocation history. Goals do not change ledger balances. Investment values are not live market quotes.

Scanner is reorganized around file selection and review. Technical format information and optional AI configuration use disclosures. Existing transaction, recurring, credit, budget, report, scanner and account form IDs are preserved.

PWA foundation includes relative manifest/scope, app icons, install guidance, safe-area spacing, and a static-asset service worker with an explicit offline screen. There is no APK, native-store submission or publication in this task.

## Verification

- 10 Node tests pass: daily allowance, end-of-month/overspending, goal validation/progress, date validation, same-account transfer rejection, ledger preservation, card repayment, bank detection/amount parser compatibility.
- 8 Playwright scenarios pass: 11 routes at 1440/390/320 widths; theme persistence; goal lifecycle and unchanged account balances; monthly limit/privacy; expense persistence/deletion; account list updates and demo isolation; mobile dialogs/navigation; nested deployment/PWA offline fallback; browser Back behavior.
- 4 Python backend tests pass: health/CORS for preview port 4173; missing API key fails locally; numeric/date AI changes rejected; .env path resolution independent of working directory.
- 22 JavaScript modules and the service worker pass syntax checks. Python parses. HTML has 167 unique IDs; all local references/imports and manifest resolve.
- Screenshots are in `artifacts/previews/`. Automated WCAG A/AA checks cover dashboard, goals, scanner and settings in light/dark modes. Raw findings are in `artifacts/accessibility.json`; this automated check is not a complete accessibility certification.
- A separate reviewer reproduced two introduced bugs (stale account buttons and a visible private goal bar). Both were fixed and verified with regression tests.

## What remains unverified

- Actual Firebase login and cloud writes with the user's account, cross-device goal updates, and production rules deployment. Existing cloud repository functions and user collection paths are retained; planning adds `users/{uid}/settings/planning`.
- Live NVIDIA model availability, external API responses and a production deployment. No API key or bank statement was sent during this task. The backend's existing unauthenticated API design remains; production access protection needs a separate deployment decision.
- Real BCA/Mandiri/Krom PDF regression fixtures were not present in this folder. Historical `.txt` test reports were inspected but are not presented as fresh tests. Native scanner algorithms are preserved.
- Installation on a physical Android/iPhone and app-store packaging. The browser test verifies manifest assets and offline navigation, not a phone OS installation.

## Handoff

Run `START_SPENDLY.bat` or `npm.cmd start`; open `http://127.0.0.1:4173/?demo=1`. Normal Firebase entry is `/`.

`artifacts/spendly-web-redesign.zip` contains only the static frontend (31 files), ready to review before deployment. It excludes backend credentials, node_modules, the virtual environment and test artifacts. Deploy backend separately if AI is needed.

Original backup: `../SPENDLY-before-redesign-20261015.zip`. No Git initialization, remote push, cloud data mutation or public deployment was performed.
