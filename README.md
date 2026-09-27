# Fitron

Gym management and accounting software for Indian gyms: members, plans and renewals, GST invoices, payments, expenses and P&L, assets, purchases, POS, classes, leads, attendance, WhatsApp reminders, UPI Autopay and Fitron AI. Multi-branch, sold as SaaS.

## What's here

- `prototype/` — the working browser prototype. Open `prototype/Fitron Gym.dc.html` in a browser (serve the folder over HTTP, e.g. `npx serve prototype`). Data lives in the browser's localStorage; WhatsApp and UPI Autopay are simulated.
- `prototype/HANDOFF.md` — the production build spec: stack, Prisma schema, business rules, REST API, scheduled jobs, security and acceptance tests.
- `prototype/connector/` — Node service for linked-device WhatsApp sending and Razorpay UPI Autopay. See its README.

The production app described in `HANDOFF.md` has not been built yet.
