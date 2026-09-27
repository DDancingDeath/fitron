# Fitron

Gym management and accounting software for Indian gyms: members, plans and renewals, GST invoices, payments, expenses and P&L, assets, purchases, POS, classes, leads, attendance, WhatsApp reminders, UPI Autopay and Fitron AI. Multi-branch, sold as SaaS.

## What's here

- **The production app** (repo root): Next.js (App Router) + TypeScript + Tailwind, Postgres via Prisma. Being built from `prototype/HANDOFF.md`.
  - `prisma/schema.prisma`: core schema (tenancy, staff and roles, members, plans, memberships, invoices, payments, expenses, audit log, month locks, settings, sequences).
  - `src/lib/domain/`: business rules with unit tests (invoice totals and GST, computed invoice status, membership status, date maths).
- **`prototype/`**: the working browser prototype. Serve the folder (`npx serve prototype`) and open `Fitron Gym.dc.html`. Data lives in localStorage; WhatsApp and UPI Autopay are simulated.
  - `prototype/HANDOFF.md`: the production build spec.
  - `prototype/connector/`: WhatsApp linked-device and Razorpay UPI Autopay service.

## Develop

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # point DATABASE_URL at a Postgres database
npm run db:migrate     # create tables
npm run dev            # http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Money is stored as integer paise. Invoice and membership status are computed, never stored.
