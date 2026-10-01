# Put Fitron live on a free server

This sets up Fitron on an **Oracle Cloud "Always Free"** server. The server is free with no time limit, and it can easily handle 100 staff and thousands of members. You get:

- the app, served over HTTPS with automatic certificates
- the Postgres database
- daily reminders and other jobs at 06:30 India time
- a backup every night at 02:00

It takes about 30 minutes. You only type commands in steps 5 to 7.

## 1. Create the Oracle Cloud account

1. Go to <https://www.oracle.com/cloud/free/> and sign up.
2. Pick **India South (Hyderabad)** or **India West (Mumbai)** as your home region. You can't change it later.
3. Oracle checks your card. It stays on the free tier and doesn't charge you unless you choose to upgrade.

## 2. Create the server

In the Oracle console, go to **Compute › Instances › Create instance**.

- **Image:** Canonical Ubuntu 24.04.
- **Shape:** Ampere, `VM.Standard.A1.Flex`, with 2 OCPU and 12 GB memory. That's well inside the free allowance of 4 OCPU and 24 GB.
- **Networking:** leave the defaults, and make sure "Assign a public IPv4 address" is on.
- **SSH keys:** choose "Generate a key pair for me" and **download the private key**. You need it to log in.
- **Boot volume:** 100 GB (up to 200 GB is free).

Press **Create**. When it's running, note its **Public IP address**.

> If it says **"Out of capacity"**, try another *availability domain* in the same form, or try again later. Free Ampere servers are in demand.

## 3. Let web traffic in

Go to **Networking › Virtual cloud networks**, then your network, then **Security Lists › Default Security List › Add Ingress Rules**. Add two rules:

| Source CIDR | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

## 4. Point a web address at the server

**For fitron.in:** at the registrar where you bought fitron.in, open its DNS settings and add two records:

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| `A` | `@` (some registrars want it blank or `fitron.in`) | the server's public IP | 600 or the lowest offered |
| `A` | `www` | the server's public IP | 600 or the lowest offered |

Delete any other `A`, `AAAA` or `CNAME` records for `@` and `www` first (registrars often add a "parking" record). Leave `MX` and `TXT` records alone: they're for email. When the install script asks for the domain, type `fitron.in`. The landing page is then at `https://fitron.in`, staff sign in at `https://fitron.in/login`, and `www.fitron.in` redirects to `fitron.in`.

Other options:

- **Another domain** (about ₹800 a year from any registrar). Add an **A record**, for example `app` pointing to the server's public IP. That gives you `app.yourgym.in`.
- **Free:** sign in at <https://www.duckdns.org>, create a name such as `yourgym`, and set its IP to the server's public IP. That gives you `yourgym.duckdns.org`.

New records take from a few minutes to a few hours to work. Check with `nslookup fitron.in`: it should print the server's IP before you run the install in step 7.

## 5. Log in to the server

On Windows, use PowerShell. On Mac, use Terminal.

```bash
ssh -i path/to/the-downloaded-key.key ubuntu@YOUR_SERVER_IP
```

If it complains about the key's permissions on Mac or Linux, run `chmod 600 path/to/the-downloaded-key.key` first.

## 6. Get the code

The repository is private, so the server needs its own read-only key:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copy the line it prints. On GitHub, open the repository, go to **Settings › Deploy keys › Add deploy key**, and paste it. Leave "Allow write access" **off**. Then:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone git@github.com:sumitgoxlofficial-jpg/fitron.git
cd fitron
```

## 7. Install

```bash
bash deploy/install.sh
```

The script:

- installs Docker and opens the server's firewall
- asks for your web address
- generates the database password and secret keys
- builds and starts everything

The first build takes 5 to 10 minutes. At the end it asks for your gym name and owner login.

Open `https://your-address` and sign in. 🎉

## 8. Switch on the real services

Until you add their keys, everything runs in **demo mode**: nothing is charged and nothing is sent. To add keys, run the command below on the server. Fill in only what you use, then save with Ctrl+O, Enter and Ctrl+X.

```bash
nano deploy/.env
```

| What | Settings | Also set up |
|---|---|---|
| WhatsApp (official) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` | In Meta: webhook `https://your-address/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN` from the file |
| UPI Autopay (your gym's Razorpay) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook `https://your-address/api/webhooks/razorpay` |
| Fitron AI | `ANTHROPIC_API_KEY` | from console.anthropic.com |
| Email (website enquiries) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ENQUIRY_TO` | Verify fitron.in with your email provider (it gives you DNS records to add) |
| Extra-branch billing (Fitron's Razorpay) | `FITRON_RAZORPAY_KEY_ID`, `FITRON_RAZORPAY_KEY_SECRET`, `FITRON_RAZORPAY_WEBHOOK_SECRET`, `FITRON_GSTIN`, `FITRON_ADDRESS` | Razorpay webhook `https://your-address/api/webhooks/fitron-billing` |
| Documents in the cloud (optional) | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | e.g. a Cloudflare R2 bucket (free up to 10 GB); otherwise they're kept on the server |

Then apply them:

```bash
bash deploy/update.sh
```

Never paste these keys into chat or email. They belong only in this file on the server.

## Door devices (ZKTeco / eSSL)

On the device, open **Menu › Comm. › Cloud Server Setting**. Set the server address to your web address and the port to **80**, then restart the device. Add its serial number in Fitron under **Settings › Door devices**.

## Everyday care

- **Updates:** `cd ~/fitron && bash deploy/update.sh`. This gets the latest version and applies any database changes.
- **Backups:** saved nightly in `~/fitron/deploy/backups` and kept for 14 days. Copy them off the server now and then, for example from your computer:
  `scp -i key ubuntu@YOUR_SERVER_IP:fitron/deploy/backups/*.dump .`
  For extra safety, turn on a free boot-volume backup in Oracle under **Block Storage › Boot Volumes › Backups**.
- **Restore a backup:** `bash deploy/restore.sh deploy/backups/fitron-YYYYMMDD-HHMM.dump`
- **See what's running:** `cd ~/fitron/deploy && docker compose ps`
- **See errors:** `cd ~/fitron/deploy && docker compose logs --tail 100 app`
- **Health check** for an uptime monitor such as UptimeRobot (free): `https://your-address/api/health`

## How much it can handle

A 2-core, 12 GB server runs Fitron comfortably for 100 staff using it at the same time, and for tens of thousands of members. When you outgrow it, raise the server to 4 cores and 24 GB in Oracle. That's still free.
