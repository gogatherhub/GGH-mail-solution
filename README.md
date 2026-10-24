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

## UI and navigation

Authenticated pages share a persistent workspace layout, so the sidebar and header stay mounted during navigation. Route loading skeletons, automatic link prefetching, hover prefetching and pending indicators provide feedback while fresh data arrives. Forms use shadcn/ui controls and disable submit buttons while their server action is running. Saves show confirmed success; email submission shows **Queued**, with actual provider acceptance recorded separately in **Outbox**.

The interface uses the self-hosted Geist font, shared color tokens, keyboard focus indicators, accessible account menus and a reduced motion preference. Native selects and file inputs retain their existing form behavior.

Dashboard conversation rows have one native link hit area covering the complete row, including empty space. Filter menus open on desktop hover, select on click/Enter, and open on tap on touch devices. Form fields retain native selects. Layouts and typography adapt at phone and tablet widths; wide data tables scroll within their cards.

Team members have profile photos with initials as fallback. Users can upload, replace or remove their own photo from My profile. Uploaded JPEG/PNG/WebP bytes are verified, decoded with a pixel limit, resized to 256×256 and re-encoded as WebP with metadata removed. SVG and animated images are rejected. Photos are served only through an authenticated endpoint, accessible to the owner and administrators, with no shared cache.

## Browser checks

Run `npm run build`, then `npm run test:ui`. The Playwright suite uses installed Google Chrome by default; set `PLAYWRIGHT_CHANNEL=msedge` to use Microsoft Edge. Tests cover persistent navigation, inbox tabs, create and edit flows, role restrictions, bulk read actions, pending email controls, send failures and mobile overflow.

The test server uses port 3100 and creates a unique SQLite file under `.next/` through `DEMO_DATABASE_URL`. Mail credentials point to an isolated SMTP fixture on port 3101, which captures email locally and never delivers it externally. The regular demo database and `.env.local` are not modified. Screenshots and failure traces are written to the ignored `test-results/` directory.

## Outbox and saved drafts

Direct email requests commit the idempotency key, message and outbox job in one database transaction. Next.js `after()` starts a worker after the response, so composing does not wait for the provider. Outbox distinguishes queued, processing, accepted, failed, cancelled and unconfirmed requests. Explicit rejections and preparation failures can be retried. Unconfirmed requests and expired processing leases are marked **Needs review** and are never automatically resent. Accepted jobs clear their stored attachment payload. Resend also receives the stable idempotency key; SMTP cannot guarantee exactly-once delivery after an ambiguous network failure.

The protected `GET /api/jobs/send-outbox` endpoint processes up to two pending jobs per request and recovers expired leases. Call it with `Authorization: Bearer CRON_SECRET` from a frequent external scheduler for durable recovery if a hosting instance stops. The existing daily campaign cron also services the direct outbox. Immediate `after()` processing is the normal path; a daily cron alone is not a timely recovery schedule. Provider timeout, deployment lifetime and scheduler frequency determine recovery time. Configuration changes can require retrying preparation failures from Outbox.

Compose and replies save private drafts to the database after a short typing pause. Draft revisions prevent one browser tab silently overwriting another; the UI shows a conflict if a stale revision is submitted. Draft reads and writes check the owner and assigned mailbox, and queued draft IDs cannot be recreated by a delayed autosave. Files are not autosaved and must be attached again when reopening. An unsaved changes warning protects browser close/reload. Search opens with Ctrl/⌘ K or `/`; `C` composes when outside text fields, and Ctrl/⌘ Enter sends from the composer.

## Analytics and contact identity

The admin Analytics page combines direct and campaign sends, offers date and mailbox filters, daily charts, channel comparisons and recipient drill-down. Charts have accessible data tables. Rates divide unique engaged emails by sent emails, not by raw tracking event count. Recipient history preserves each message ID, including intentional repeat sends to the same normalized email address. The employee dashboard uses only the assigned mailbox. Time buckets are UTC; dashboard charts cover 14 days and the analytics chart accepts up to one year. Recipient history also supports all-time date ranges.

CSV import normalizes and deduplicates email addresses within the file and against existing contacts. It adds new addresses once, skips existing addresses and reports added, skipped and invalid row counts. Existing contact IDs, details, consent and linked message/campaign history are preserved. To change an existing record, edit it explicitly. No existing contact or send history is deleted during import.

## Access controls

Protected pages require a signed, HTTP-only session. Server actions repeat authorization checks, and search, drafts and outbox enforce server-side ownership/mailbox scope. Draft mutation endpoints reject cross-origin requests and sensitive JSON responses use `private, no-store`. Account changes and logout revoke sessions using session versions. Repeated failed sign-ins are throttled in the database; security headers prevent framing and suppress referrer leakage. Email HTML is sanitized, webhook bodies have streaming size limits and webhook/worker endpoints require their configured signatures or secrets. Signed email tracking and unsubscribe links intentionally remain public capabilities; they do not grant access to workspace pages or email content.

These controls and regression tests do not constitute a guarantee that every vulnerability has been eliminated. Live MySQL migrations, hosting configuration and real provider delivery must also be validated in the deployment environment.

## Real email and analytics test

1. Verify a domain you control in [Resend Domains](https://resend.com/domains) and add the DNS records it provides. Create a **sending access** key in [Resend API Keys](https://resend.com/api-keys), then set `RESEND_API_KEY` in `.env.local`. The direct API is preferred because it returns a provider email ID that the delivery and bounce webhook can match. SMTP remains a fallback for basic sending.
2. In **Email accounts**, replace the example mailbox with an address on that verified domain. Add your own inbox as a contact, choose its audience type, and explicitly opt it in.
3. Set `APP_URL=https://welfog.vercel.app` in the Vercel Production environment and redeploy. Tracking links are embedded when an email is sent; a placeholder or localhost URL breaks old links and cannot be corrected retroactively. The app now rejects placeholder URLs and can use Vercel's production URL when that system variable is exposed.
4. In the Resend dashboard, create one webhook pointing to `https://YOUR_APP_URL/api/resend/webhook` and select `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, and `email.received`. Copy **that webhook's** signing secret into `RESEND_WEBHOOK_SECRET` and redeploy. To populate Inbox, enable Resend Receiving for your address/domain, then register the same receiving address under **Email accounts** in Welfog. Replies appear under **Inbox** in Conversations. A Welfog mailbox record does not create a provider inbox, and adding a Gmail address does not sync Gmail. Configure receiving DNS carefully if the domain already receives email elsewhere.
5. Create and queue a campaign with a normal `https://` link in its body. Click **Send next 20** on the campaign page, or run the scheduled worker with `Authorization: Bearer CRON_SECRET` at `/api/jobs/send-campaigns`. Open the email and click its link. The campaign and contact pages then show opens and clicks. Open tracking is approximate due to mail client privacy features.

SMTP alone does not deliver bounce and complaint events into this app. The Resend API plus `/api/resend/webhook` supports these statuses; `/api/events` remains available for other providers through a normalized internal event payload protected by `EVENT_WEBHOOK_SECRET`.

## Switching to MySQL later

1. Provision MySQL 8+ and create an empty `welfog` database. Obtain its host, port, database name, username, password, and any required TLS settings from the database provider.
2. Set `DEMO_MODE=false` and `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/welfog` in `.env.local` or your hosting environment. URL-encode special characters in the password. Keep `SESSION_SECRET` and `TRACKING_SECRET` stable.
   For an Aiven MySQL Service URI, reveal and copy the real password and keep `?ssl-mode=REQUIRED` at the end. The app maps that option to MySQL TLS. For verified TLS, download the project CA certificate from Aiven, set its PEM contents as `MYSQL_CA_CERT`, and use `ssl-mode=VERIFY_IDENTITY` in the URL. Never use the literal `CLICK_TO_REVEAL_PASSWORD` placeholder.
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
