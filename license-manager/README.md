# License Manager

A working software license inventory and renewal dashboard for a local organization workspace. Built with Next.js 16, React, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Prisma 7, SQLite, Recharts, and Lucide.

## Quick start

Use a current Node.js installation (Node 22.12+ or Node 24 recommended) and npm. Development was verified with Node 25.8.0.

```sh
cd license-manager
npm ci
npm run db:setup
npm run auth:setup -- admin@example.test
npm run dev
```

Open **http://127.0.0.1:3000** and sign in with the generated credentials in `.admin-credentials`. Store the password in a password manager, then delete that file. Commands must run from the `license-manager` directory.

`db:setup` creates a private `.env` with a random encryption secret if none exists, generates Prisma Client, applies committed migrations, and inserts example data. It preserves an existing `.env` and existing seed records.

The initial database has **18 realistic licenses, 12 vendors, 6 departments, and 3 people**. All license identifiers are synthetic. Seed expiration dates are relative to the initialization day and include expired, urgent, upcoming, and long-term agreements. Existing seeded dates are not moved when you rerun the seed.

## Features

- Six dashboard summaries and four interactive charts: vendors, statuses, projected monthly costs, and upcoming expirations.
- Persistent license create, read, update, delete, and duplicate workflows.
- CSV license import with a template, validation preview, duplicate checks, and atomic saving.
- Server-validated forms, seat tracking, available-seat calculations, utilization bars, and ownership.
- Database search, sorting, pagination, and filters for vendor, status, department, owner, expiration period, and license type. Filtered URLs are bookmarkable.
- Full details, contract and renewal information, notes, and change history.
- Expiration planning grouped into non-overlapping periods.
- Vendor and department management, including protection against deleting entries with linked licenses.
- Financial and utilization reports, separated by currency.
- Persistent in-app reminders, unread counts, individual/bulk read actions, and manual checks.
- Transactional audit history that survives license deletion.
- Responsive navigation, searchable top bar, mobile table scrolling, accessible dialogs, loading/error states, and empty states.

## Environment and database

See `.env.example` for the required variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite URL, default `file:./prisma/dev.db`. An absolute `file:/absolute/path/licenses.db` is useful for service deployment. |
| `LICENSE_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters. Used for AES-256-GCM encryption. |
| `APP_URL` | Exact browser origin, default `http://127.0.0.1:3000`. Use an HTTPS URL for any non-loopback deployment. Login and logout require this origin. |

Generate a secret manually with `openssl rand -hex 32`. Never commit `.env`, database files, or encryption secrets. **Keep the encryption key with your secure backup configuration**: changing or losing it prevents decryption of existing stored keys. A real rotation needs to decrypt with the old secret and re-encrypt with the new one; replacing the environment variable alone is not a rotation.

Application settings default to Northstar Health Group, `Europe/Riga`, and EUR. Settings changes persist in SQLite. Changing the default currency does not convert existing licenses.

### Initialize an existing environment

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
```

### Create a migration after editing the schema

```sh
npm run db:migrate -- --name describe_your_change
npm run db:generate
```

Commit the generated SQL under `prisma/migrations/` with the schema change. Apply committed migrations to another database with `npm run db:deploy`. Do not use `prisma db push` in place of migration history.

The schema contains `License`, `Vendor`, `Department`, `User`, `Notification`, `AuditLog`, `AppSettings`, `AdminCredential`, `AdminSession`, and `LoginThrottle`. Foreign keys prevent orphaned ownership records. Deleting a license nulls its reference in retained audit/notification records; product-name snapshots preserve context.

For backup, stop application writers and the reminder scheduler, then back up the SQLite database together with the securely stored encryption configuration. Restore both before restarting. Tests use separate temporary databases and never reset `prisma/dev.db`.

## Development and production commands

```sh
npm run dev          # Local development with hot reload
npm run lint         # ESLint
npm run typecheck    # Next route types and TypeScript
npm test             # Isolated calculation and database integration tests
npm run build        # Optimized production build
npm run start        # Serve the production build on localhost
```

Use `APP_URL=http://127.0.0.1:3002 npm run dev -- --port 3002` if port 3000 is occupied. Both start commands bind to `127.0.0.1` by default.

Workspace access requires an explicitly provisioned administrator account. Directory users and seed data do not grant login access, and `DEMO_USER_EMAIL` is no longer used. `src/lib/actor.ts` validates the request session and the associated administrator grant; pages, data services, search, and every administrative Server Action enforce this check. All provisioned administrators have full workspace access; there are no limited-access roles or public signup. `/api/health` remains a public, minimal readiness check.

### Administrator setup and recovery

For an existing installation, stop the app, run `npm run db:generate` and `npm run db:deploy`, then run `npm run auth:setup -- your-email@example.com`. Restart after rebuilding. The setup command creates the directory user if needed and grants administrator access with a randomly generated password. It writes the credential to `.admin-credentials` with owner-only permissions and refuses to overwrite an existing file. Read it locally, save the password securely, and delete the file. No credentials are printed to logs or committed.

To reset an account, repeat the command with the same email after removing the old credential file. Resetting revokes all of that account's sessions. Provision additional administrators with distinct emails so audit history records the actual signed-in person. Remove an administrator's `AdminCredential` through trusted database administration to revoke their access and sessions; do not delete historical directory users.

Passwords use salted scrypt hashes. Random session tokens are stored only as SHA-256 hashes in SQLite, expire after eight hours, and are revoked on sign-out. Cookies are HttpOnly and SameSite=Strict; HTTPS origins use Secure cookies with a `__Host-` prefix. Configure `APP_URL` to match the exact browser origin (including an alternate local port). Non-loopback HTTP origins are rejected. For network deployment, terminate HTTPS at a trusted reverse proxy and prevent direct access to the backend HTTP port.

Login is limited to ten attempts per fifteen-minute window across the workspace, persisted in SQLite so restarts and caller-supplied IP headers cannot bypass it. This deliberately conservative limit can temporarily block legitimate sign-ins; the local setup/reset command clears the budget. The app has no MFA or SSO integration. Protect the SQLite database and its backups because they now also hold password hashes and session records.

 A Node.js host with persistent disk is required for this SQLite design; ephemeral/serverless filesystems are unsuitable. No site has been published.

If the tool environment blocks Next.js's internal CSS compiler port, allow the build command to run with local process/network permissions. The application itself does not require a remote service or font download at build time.

## Calculations and financial meaning

Calendar dates use `YYYY-MM-DD`, with today's date resolved in the organization timezone. Day arithmetic is independent of daylight-saving changes.

| Status | Days remaining | Color |
| --- | --- | --- |
| Active | More than 60 | Green |
| Expiring Soon | 31–60 | Yellow |
| Expiring | 0–30 | Orange |
| Expired | Less than 0 | Red |

Expiration today displays “Expires today.” Dashboard “Expiring Soon” includes both unexpired warning bands, through 60 days. The Expirations page uses disjoint ranges: expired, 0–7, 8–30, 31–60, 61–90, and over 90 days.

Available seats are purchased minus assigned. Utilization is assigned/purchased, with orange above 90%, red at 100%, and an underutilization indicator below 70%. Thresholds use the unrounded ratio; displayed percentages are rounded. Untracked licenses have zero seat counts and display “Not seat-based.” Assigned seats cannot exceed purchased seats.

Annual cost is the canonical recurring commitment, stored as integer hundredths of the selected currency. The form can accept a monthly equivalent and convert it to annual cost; displayed monthly cost is annual/12. Summary costs include all inventory records, including expired agreements, so they describe inventory value rather than paid invoices. Reports never add different currencies together or assume exchange rates.

The monthly chart projects the next 12 calendar months from recorded start/expiration dates, prorated by covered days within each month. It does not invent past spending, assume renewals, or extend dates based on the auto-renewal flag. “Expiring license value” is the annual value of unexpired agreements due within 90 days. Unused-seat value assumes uniform seat pricing and is an estimate, not guaranteed savings. Aggregate seat utilization is weighted by purchased seats.

## Notifications and future email delivery

Run an expiration check manually:

```sh
npm run notifications:run
```

Checks also run when server-rendered workspace pages load. To generate reminders while nobody is using the app, schedule the command daily with cron, launchd, or your service scheduler. For example, after adjusting the project path and ensuring Node/npm are on the scheduler's PATH:

```cron
0 8 * * * cd /absolute/path/license-manager && /absolute/path/to/npm run notifications:run >> /absolute/path/to/license-reminders.log 2>&1
```

No system scheduler is installed automatically.

Thresholds are 90, 60, 30, 14, 7, and 1 day, plus one overdue alert. A missed check generates the nearest reached threshold instead of every missed threshold. Each alert is uniquely keyed by license, expiration date, recipient, and threshold; repeated checks do not duplicate it. Notifications go to the responsible person and each provisioned administrator, deduplicated when they are the same user. The UI displays the signed-in administrator's inbox, and read actions are scoped to that user.

Changing an expiration date marks old-cycle notifications read and allows reminders for the new date. Deleting a license retains its notification history and marks it read. Disabling reminders in Settings pauses generation without deleting history.

`src/services/notification-job.ts` defines `NotificationChannel` and its working `InAppNotificationChannel`. Email can be added as a separate delivery consumer of the durable notifications, with a persisted delivery cursor/outbox, retries, provider credentials, and delivery status. Email is not currently sent. The manual runner does not need the web server running or a browser session. Its internal job module is separate from the authenticated web wrapper and exposes no HTTP endpoint.

## Import licenses from CSV

Open **Licenses → Import CSV**. Download the template, replace its example row, choose your file, and select **Preview CSV**. Review the records, then select **Import N licenses**. Only authenticated administrators can preview or import.

Files must use UTF-8, comma or semicolon separators, and contain at most 500 licenses / 512 KiB. Quoted fields support delimiters, doubled quotes, and line breaks. Column names may use underscores or spaces, and matching ignores capitalization. Required columns:

```csv
product_name,vendor,department,owner_email,license_type,purchase_date,start_date,expiration_date,annual_cost,currency
```

Vendor and department names must match existing directory entries; `owner_email` must match an existing person's email. The importer does not create directory entries or grant login access. Ambiguous names are rejected. Dates use `YYYY-MM-DD`. Annual cost uses ordinary currency units (for example `1200.50`), with no currency symbol or thousands separator and at most two decimals. License types and currencies use the same supported values as the manual form.

Optional columns: `license_key`, `seat_tracking`, `purchased_seats`, `assigned_seats`, `renewal_date`, `auto_renewal`, `supplier`, `contract_number`, `notes`. Blank seat tracking defaults to true; purchased seats default to 1, or 0 when tracking is disabled; assigned seats default to 0. Auto-renewal defaults to false, and other optional values remain empty. Booleans accept true/false, yes/no, or 1/0. The template uses current directory entries and contains no license keys. Spreadsheet formula prefixes in generated template values are escaped; if your actual directory name starts with such a character, ensure its CSV value matches the directory name when importing.

Preview makes no changes and shows only whether a license key was provided. Validation errors identify the CSV record number (header = row 1, including when a quoted field spans text lines) and field. Up to 100 errors are displayed at once. Fix all errors before importing. Agreements with the same product, vendor, department, and contract number, ignoring surrounding whitespace and capitalization, are rejected both within the file and against existing inventory. Import creates new records; use the normal edit form to update an existing agreement.

The server validates the file again when saving. All licenses and their audit events commit in one transaction; a failure rolls back the entire file. Repeated or concurrent submissions cannot import the same agreement twice through this importer. Keys use the same encryption and audit redaction as manual entry, and uploaded files are not retained on disk.

## Key protection and audit history

Keys are encrypted with AES-256-GCM and a fresh nonce for every write. Normal database views omit ciphertext, and normal UI responses contain only the masked suffix. Reveal is an explicit server action; it records an audit event and returns the plaintext only to that request. The UI hides a revealed key after 30 seconds or when its browser tab becomes hidden. Duplicate forms clear the key, assigned seats, and contract number.

Create, edit, and delete operations record their actor and before/after snapshots in the same database transaction. Edits additionally record expiration, seat, and cost changes. Key changes record only whether a key exists; plaintext, ciphertext, and key suffixes are excluded from audit snapshots. Key reveals record the event without the key value.

Version checks reject stale edits/deletions. Audit records remain readable after the license is deleted. Audit date filters use UTC boundaries; displayed event timestamps use the organization timezone.

## Browser verification

The browser suite uses an isolated temporary SQLite database, a temporary administrator password, and a production server on port 3101. Build first:

```sh
npm run build
npm run test:e2e
```

By default, Playwright uses an installed Google Chrome. Alternatively:

```sh
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

The suite verifies anonymous page/API/RSC rejection, forged cookies, login/logout, revoked-session and direct Server Action replay rejection, and all main pages, charts, global search, filtering, pagination, 390px navigation/layout, form validation, CRUD/duplication, key masking/reveal, audit retention, directory changes, settings, and read actions. Screenshots are saved in `test-results/`; failed runs also retain traces. The database is removed after the test run.

The integration suite applies the real migrations to a temporary database. It covers date boundaries/DST/leap dates, utilization, currency separation, validation, authenticated encryption/tampering, CRUD persistence, transaction failures, optimistic concurrency, filtering, every reminder threshold, concurrent deduplication, renewal cycles, recipient scoping, settings, directory constraints, and financial projections.

Security checks cover unauthenticated reads and writes, directory-user denial, password verification, session tampering/expiration/revocation, administrator audit identity, login throttling, and secure cookie configuration. Run the test commands above after applying migrations. The last dependency audit reported no vulnerabilities. An npm override pins the linter's transitive minimatch dependency to a patched 11.x version.

## Project layout

```text
prisma/                 Schema, committed migrations, idempotent seed
scripts/                Environment setup, notification runner, isolated test runners
src/app/                App Router pages, layouts, and read-only API routes
src/actions/            Validated server-action boundaries and cache revalidation
src/components/         Shell, forms, tables, charts, and shadcn/ui primitives
src/lib/                Database client, actor boundary, calculations, encryption, validation
src/services/           CRUD, directories, statistics, and notifications
src/generated/prisma/   Generated Prisma Client (ignored; regenerate during setup)
tests/                  Calculation, database, and browser tests
```

`GET /api/search` searches license/product/vendor/department/owner context and returns safe summaries. `GET /api/health` checks database connectivity. All writes use Server Actions and server-only services; no mock API or browser-local persistence is used.
