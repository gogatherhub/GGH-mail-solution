# Welfog Mail

Next.js shared inbox and outreach workspace. The UI, server actions, API routes and campaign dispatch endpoint live in one Next.js application.

## Implemented

- Admin and employee login with signed, HTTP-only sessions and hashed passwords
- Dashboard, scoped conversations, compose/reply/forward, read status and bulk actions
- Users and mailbox registry with admin management and employee mailbox assignment
- Contacts for clients, vendors and planners, including CSV import and explicit campaign consent
- Campaign drafts, queue/pause, capped dispatch batches, automatic suppression, unsubscribe, opens and clicks
- Per-contact and per-campaign analytics
- SMTP or Amazon SES outbound sending; inbound and delivery-event webhook endpoints

## Local setup

1. Copy `.env.example` to `.env.local`. For a local demo, set `DEMO_MODE=true`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and long, private `SESSION_SECRET` and `TRACKING_SECRET` values. `DATABASE_URL` can stay empty.
2. Run `npm install`, then `npm run dev`.
3. Open `http://localhost:3000/login`. Demo data is stored in the ignored local `welfog-demo.db` file. Example contacts are not opted in and are never eligible for new campaigns.

Demo mode uses a local SQLite database only for evaluation. Real email sending still requires SMTP or SES credentials; the application never pretends a message was sent. Environment values are intentionally excluded from Git.

## Real email and analytics test

1. Verify a domain you control in [Resend Domains](https://resend.com/domains) and add the DNS records it provides. Create a **sending access** key in [Resend API Keys](https://resend.com/api-keys), then set `RESEND_API_KEY` in `.env.local`. The direct API is preferred because it returns a provider email ID that the delivery and bounce webhook can match. SMTP remains a fallback for basic sending.
2. In **Email accounts**, replace the example mailbox with an address on that verified domain. Add your own inbox as a contact, choose its audience type, and explicitly opt it in.
3. Set `APP_URL` to a public HTTPS URL pointing to this app, such as a deployed preview or a temporary HTTPS tunnel. A recipient's email client cannot call `localhost`; tracked campaigns refuse to send with a local `APP_URL`.
4. In the Resend dashboard, create a webhook for `email.delivered`, `email.bounced`, `email.complained` and, if using Resend Receiving, `email.received` pointing to `https://YOUR_APP_URL/api/resend/webhook`. Copy its signing secret into `RESEND_WEBHOOK_SECRET`. The app checks the webhook signature before updating delivery, bounce, complaint and incoming message records. Configure the receiving domain and DNS in Resend only if you want Resend to handle inbound mail; changing MX records on an existing mailbox domain needs planning.
5. Create and queue a campaign with a normal `https://` link in its body. Click **Send next 20** on the campaign page, or run the scheduled worker with `Authorization: Bearer CRON_SECRET` at `/api/jobs/send-campaigns`. Open the email and click its link. The campaign and contact pages then show opens and clicks. Open tracking is approximate due to mail client privacy features.

SMTP alone does not deliver bounce and complaint events into this app. The Resend API plus `/api/resend/webhook` supports these statuses; `/api/events` remains available for other providers through a normalized internal event payload protected by `EVENT_WEBHOOK_SECRET`.

## Switching to MySQL later

1. Provision MySQL 8+ and create an empty `welfog` database. Obtain its host, port, database name, username, password, and any required TLS settings from the database provider.
2. Set `DEMO_MODE=false` and `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/welfog` in `.env.local` or your hosting environment. URL-encode special characters in the password. Keep `SESSION_SECRET` and `TRACKING_SECRET` stable.
3. Restart the app. It creates the MySQL tables and the initial admin account from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Use a strong password of at least 12 characters in production.

The local demo database is separate from MySQL. Data entered in demo mode does not migrate automatically.

## Mail integration

- Configure `AWS_REGION` and AWS credentials for SES, preferably with `SES_CONFIGURATION_SET` for event publishing. SMTP is a fallback for sending.
- Verify sender domains and configure SPF, DKIM and DMARC with the mail provider before campaigns.
- The mailbox screen registers mailboxes in the app. It does not provision accounts on the existing mail server; that requires the server's admin API or an adapter.
- Resend Receiving uses the signed `/api/resend/webhook` endpoint. For another existing mail system, relay inbound JSON `{from,to,subject,html,name,messageId}` to `/api/inbound` with `x-welfog-secret: INBOUND_WEBHOOK_SECRET`.
- Relay provider events as JSON `{type,providerId,eventId}` to `/api/events` with `x-welfog-secret: EVENT_WEBHOOK_SECRET`. Supported types are `delivered`, `bounce` and `complaint`.
- Set `CRON_SECRET` in Vercel project environment variables. On Vercel Hobby, `vercel.json` runs the campaign worker once daily at 03:00 UTC (approximately 08:30–09:29 IST because Hobby timing can vary within the hour). Each run processes up to 20 recipients. Use **Send next 20** on a queued campaign to process more batches manually. For automatic, more frequent processing, use an external scheduler with `Authorization: Bearer CRON_SECRET` or a Vercel plan that supports shorter intervals. Actual throughput should be adjusted to the verified sender's quota and reputation.
- Campaign emails include tracked links, a tracking pixel, and one-click unsubscribe headers and links. Open counts are estimates because mail clients may preload images. Delivery events require the provider relay above.

## Deployment notes

Set `APP_URL` to the public HTTPS URL. Production needs MySQL, a mail provider, configured webhook delivery and a scheduler. The app itself is one Next.js deployment; these are managed dependencies, not a separate custom backend. The existing site's database and mail-server credentials were not available, so historical messages/users and mailbox provisioning are not migrated.
