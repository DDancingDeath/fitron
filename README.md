# Fitron

Gym management and accounting software for Indian gyms: members, plans and renewals, GST invoices, payments, expenses and P&L, assets, purchases, POS, classes, leads, attendance, WhatsApp reminders, UPI Autopay and Fitron AI. Multi-branch, sold as SaaS.

## What's here

- **The production app** (repo root): Next.js (App Router) + TypeScript + Tailwind, Postgres via Prisma. Being built from `prototype/HANDOFF.md`.
  - `prisma/schema.prisma`: core schema (tenancy, staff and roles, members, plans, memberships, invoices, payments, expenses, audit log, month locks, settings, sequences).
  - `src/lib/domain/`: business rules with unit tests (invoice totals and GST, computed invoice status, membership status, date maths).
- **The website** (fitron.in): `/` is the static landing page in `public/site` (from the design export; update it with `python3 scripts/import-site.py "FITRON Website.html"`). `/signup`, `/contact`, `/privacy`, `/terms` and `/refund` are in `src/app/(site)`. Trial requests and messages are saved in the `Enquiry` table and emailed to `ENQUIRY_TO`. Prices live in `src/lib/domain/pricing.ts`; a test checks them against the page.
- **`prototype/`**: the working browser prototype. Serve the folder (`npx serve prototype`) and open `Fitron Gym.dc.html`. Data lives in localStorage; WhatsApp and UPI Autopay are simulated.
  - `prototype/HANDOFF.md`: the production build spec.
  - `prototype/connector/`: WhatsApp linked-device and Razorpay UPI Autopay service.

## Develop

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # point DATABASE_URL at a Postgres database (or run `npx prisma dev` for a local one)
npm run db:migrate     # create tables
npm run db:seed        # demo gym: sign in as sumit@demo.fitron.in / fitron-demo
npm run dev            # http://localhost:3000 (landing page; the console is at /login)
```

Checks: `npm run lint`, `npm run typecheck`, `npm test` (database tests run when `DATABASE_URL` is set), `npm run build`.

## Go live

To run Fitron for real on a free Oracle Cloud server (app, database, HTTPS, daily jobs and nightly backups in one command), follow [deploy/README.md](deploy/README.md).

## Set up a real gym (by hand)

```bash
npx prisma migrate deploy
npm run setup -- --gym "Power Haus Gym" --branch "City Centre" --name "Owner Name" \
  --email owner@example.com --phone 9876543210 --password 'a-long-password'
```

This creates the gym, its first branch, the default roles and the Super Admin account. Everything else (staff, plans, members) is added in the app.

## What works so far

- Sign-in with Argon2id passwords, server-side sessions, 30-minute idle sign-out, login rate limit.
- Roles and permissions (Super Admin, Admin, Accountant, Receptionist, Trainer), enforced on every page and action. Trainers see only their assigned members.
- Branch switcher; every query is limited to the branches a user may see.
- Members: search and filters, add, edit, suspend, soft delete, profile with computed status and dues. Phone numbers are unique among active members.
- Plans: create, edit (applies to new sales only), deactivate, delete only if never sold.
- Staff: add, edit, reset password, deactivate (signs them out).
- Every change is written to the audit log.

Money is stored as integer paise. Invoice and membership status are computed, never stored.
