# Fitron WhatsApp connector

Links the gym's WhatsApp by QR code (like WhatsApp Web) so Fitron can send reminders and invoices automatically. No Meta API key.

## Easiest: gym PC, double-click
1. Copy the `connector` folder to the reception PC.
2. Double-click **Start WhatsApp -Windows-.bat** (Mac: **Start WhatsApp -Mac-.command**). First time it offers to install Node.js, then installs itself (2–3 min).
3. In Fitron on the same PC: Settings › WhatsApp › **Link WhatsApp**. The QR appears straight away; scan it from the gym phone (WhatsApp › Linked devices › Link a device). Done.
Keep the black window open (or minimise it). With the default settings only this PC can use the connector.

## Always-on: cloud server (no PC needed)
Deploy this folder to Render (render.yaml included), Railway or any VPS with Docker. Copy the generated FITRON_KEY and the service URL into Fitron › Link WhatsApp › Connector settings once; after that every staff device just sees "Connected".

## Manual setup (terminal)
1. Install Node.js 18 or newer from nodejs.org.
2. Copy this `connector` folder to the PC, open a terminal in it and run:
   ```
   npm install
   set FITRON_KEY=pick-a-long-secret      (Mac/Linux: export FITRON_KEY=pick-a-long-secret)
   npm start
   ```
3. In Fitron › Settings › WhatsApp › Link WhatsApp, enter `http://localhost:3131` and the same key, press Connect.
4. The real QR appears. On the gym phone: WhatsApp › Linked devices › Link a device › scan.
5. Keep the terminal running (or install as a service with `pm2 start server.js --name fitron-wa`).

## Notes
- Messages go out one every 8–15 seconds, max 250 a day (`DAILY_CAP`).
- Unlink: press Unlink in Fitron, or delete the `session` folder.
- The phone must come online at least every 14 days.
- Unofficial: WhatsApp may restrict numbers that send bulk messages to people who haven't saved the number. Message only your members.
- Hosted Fitron (https) on the same PC can reach `http://localhost:3131` directly; the connector answers Chrome's private-network check. If Fitron runs on another device, or your browser still blocks it, expose the connector over https, e.g. `cloudflared tunnel --url http://localhost:3131`, and use that URL in Fitron.


## UPI Autopay (real recurring debits)
The same connector also runs Fitron's UPI Autopay through **Razorpay Subscriptions**. Set these before starting:

```
RZP_KEY_ID=rzp_live_xxxxxxxx
RZP_KEY_SECRET=xxxxxxxxxxxxxxxx
RZP_WEBHOOK_SECRET=any-long-random-string
```

In the Razorpay dashboard → Webhooks add `https://<your-connector-host>/autopay/webhook` with the secret above and the events
`subscription.authenticated, subscription.activated, subscription.charged, subscription.pending, subscription.halted, subscription.cancelled, subscription.paused, subscription.resumed, payment.failed`.
Webhooks need a public HTTPS address, so host the connector on Render (or similar), not only on the gym PC.

Then in Fitron → Settings → Integrations & AI → UPI autopay choose **Live (Razorpay)**. Creating a mandate sends the member an authorisation link on WhatsApp; once they approve it in any UPI app, Razorpay charges the plan amount on every renewal date, sends the NPCI pre-debit notice, retries failures, and Fitron records the renewal, invoice and payment automatically.
