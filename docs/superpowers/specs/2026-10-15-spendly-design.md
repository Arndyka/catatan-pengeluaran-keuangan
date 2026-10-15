# Spendly redesign

User intent: transform the existing personal budgeting app into a polished, mobile-first daily companion inspired by the supplied coral/plum references. User explicitly authorizes broad design and implementation decisions; proceed autonomously in the existing local SPENDLY folder.

Keep native ES modules, Firebase user collections, accounting journals and bank parsers compatible. No framework migration or remote publication. Backup the original folder before changes.

Visual direction: warm white canvas, plum typography, coral accent, mint positive states, rounded cards, restrained shadows, consistent line icons. Desktop sidebar and mobile bottom navigation. Light/dark themes, visible keyboard focus, 44px controls, reduced-motion support, privacy toggle, responsive forms and tables.

Dashboard: daily spending allowance from a separately configured monthly spending limit; remaining days include today; transactions dated after today excluded. Monthly income/expense summaries, actual spending chart, recent transactions, budget progress, goals preview and quick actions. No invented financial data outside explicit demo mode.

Wallets: list configured accounts including zero balances, grouped assets/debt, real journal balances, add-account action. Goals: persistent create/edit/delete records with target, saved amount, due date, icon; progress capped visually at 100%; monthly saving estimate; amounts are manually tracked earmarks and never change account balances. Store in users/{uid}/settings/planning, isolated from legacy settings.

Investments: recorded investment account balances and contributions from journals, allocation breakdown and history; clearly label cost/recorded value, never imply live market quotes or profit. No trading or market API.

Demo: explicit URL mode and visible banner, separate localStorage namespace, seeded balanced sample journals. Repository operations remain local in demo. Firebase login remains the normal path.

PWA: relative manifest, 192/512 icons, standalone display, safe-area spacing, install guidance, static shell service worker and honest offline fallback. Do not cache bank files, AI calls or authentication endpoints. Full offline cloud editing is not promised.

Validation: Node unit tests for budget/date/goal/ledger behavior; syntax and import checks; browser flows with explicit demo persistence, mobile/desktop layouts and light/dark themes; PWA offline and nested deployment paths. Existing cloud accounts and external AI integration require user credentials and remain outside automated tests.
