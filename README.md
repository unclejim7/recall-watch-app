# Recall Watch

Lets people watch specific items they own — a car seat, a car, a food product, a
medication — and get alerted the instant a matching recall is published: by email
always, and by text message or an instant phone push notification if they turn
those on. Built on public government recall APIs, so there's no data-licensing cost.

## What it covers

| Category | Source | Notes |
|---|---|---|
| Consumer products (toys, car seats, furniture, appliances) | CPSC (`saferproducts.gov`) | Free, no API key |
| Vehicles | NHTSA | Free, no API key. Matched exactly by make/model/year |
| Food | openFDA (`api.fda.gov`) | Free; optional key raises rate limit |
| Meat, poultry, eggs | USDA FSIS | Free, no API key (openFDA's food feed excludes these) |
| Drugs / medications | openFDA | Free; optional key raises rate limit |

## How matching works

- **Vehicles** are matched exactly: NHTSA is queried per unique make/model/year
  combination someone has added, so there's no ambiguity.
- **Everything else** is keyword matching: the words in what someone typed (e.g.
  "Graco 4Ever DLX car seat") must *all* appear in the recall's title/description.
  This is intentionally conservative — it can miss a match if someone's phrasing
  is very different from the recall notice's, but it won't spam people with
  loosely-related recalls. `src/matcher.js` is the place to make this smarter
  (fuzzy matching, model-number extraction, etc.) as you learn from real usage.

## Notifications

Email is always on — it's tied to the account. Two extra channels layer on top,
each opt-in and each best-effort (a failure in either never blocks the email):

| Channel | How | Setup |
|---|---|---|
| Email | nodemailer/SMTP | Required — see `.env.example` |
| Text message | Twilio SMS | Optional — set `TWILIO_*` in `.env`, user adds a phone number in their dashboard's Notifications section |
| Push notification | Web Push (Push API + VAPID) | Optional — set `VAPID_*` in `.env` (generate a keypair with `npx web-push generate-vapid-keys`), user clicks "Enable push notifications" in their dashboard |

Push works instantly on Android and desktop browsers with no app install. On
iOS Safari, Apple requires the site to be added to the home screen first
(Share → Add to Home Screen) before push permission can be granted — the
dashboard shows that instruction automatically on unsupported browsers.

Leaving `TWILIO_*` or `VAPID_*` unset simply disables that channel; the rest of
the app works the same either way.

## Running it

```bash
npm install
cp .env.example .env   # then fill in SMTP credentials
npm start
```

Visit `http://localhost:3000`, sign up, and add an item. Click "Run a check now"
on the dashboard to test end-to-end without waiting for the schedule.

By default it re-checks every 6 hours (`CRON_SCHEDULE` in `.env`, standard cron
syntax). The very first check for a brand-new item looks back 14 days so you're
not left waiting on a slow news cycle.

Use `npm run dev` instead of `npm start` while developing — it restarts on file
changes via Node's built-in `--watch`.

## Testing

```bash
npm test
```

Runs the full suite with Node's built-in test runner (`node --test`): pure unit
tests for the keyword matcher, plus end-to-end HTTP tests against the real
Express app (signup/login, session auth, item CRUD, cross-user access control).
Tests run against an in-memory SQLite database (`NODE_ENV=test`), never touch
the real recall APIs, and need no network access.

CI (`.github/workflows/ci.yml`) runs this on every push and pull request.

## Security notes

- Passwords are hashed with bcrypt; sessions are signed, `httpOnly`, `SameSite=Lax`
  cookies, and marked `secure` automatically when `NODE_ENV=production`.
- `helmet` sets standard security headers (CSP, HSTS, no-sniff, etc). The CSP
  is locked down to same-origin scripts/styles plus the Google Fonts domains
  the dashboard actually loads.
- `/api/signup` and `/api/login` are rate-limited (20 requests / 15 min / IP)
  to slow down credential stuffing.
- Deploying behind a reverse proxy (Render, Railway, Fly.io, etc.)? The app
  already sets `trust proxy`, which those platforms need for secure cookies
  and rate limiting to see the real client IP.
- Keep `VAPID_PRIVATE_KEY` and `TWILIO_AUTH_TOKEN` as secret as `SESSION_SECRET` —
  the VAPID private key can forge push notifications to any subscribed browser,
  and the Twilio auth token can send SMS (and cost money) on your account.

## Deploying

### Render (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/unclejim7/recall-watch-app)

`render.yaml` defines the whole service — Node web service on the Starter plan
(the cheapest tier with a persistent disk), a 1GB disk for `data.sqlite`
mounted at `/var/data`, the health check, and a random `SESSION_SECRET`. Click
the button, connect your GitHub account, and Render provisions it. After the
first deploy, add your SMTP credentials (required for alerts to send) and
optionally `TWILIO_*`/`VAPID_*` in the service's **Environment** tab — the
Blueprint leaves those blank on purpose rather than asking you to type
secrets into a form before it exists.

### Anywhere else

This is a single Node process + a SQLite file on disk, so it deploys cleanly to
any host with a persistent disk — Railway, Fly.io, or a small VPS all work
well too. Two things to set up:

1. **Environment variables** — copy everything in `.env.example` into your
   host's environment/secrets panel. You need real SMTP credentials (SendGrid,
   Postmark, Mailgun, or even a Gmail app password) for alert emails to send.
   Set `NODE_ENV=production` so session cookies are marked `secure`.
2. **Persistent disk** — make sure `data.sqlite` lives on a volume that survives
   deploys/restarts, not the ephemeral container filesystem. Railway and Fly.io
   both offer a "volume" you can mount for this; point `DB_PATH` at a file inside it.

A `Dockerfile` is included if you'd rather ship a container — it runs `npm ci`,
copies the app, and starts it as a non-root user on `$PORT` (default 3000).

For anything beyond a few hundred users, swap `express-session`'s in-memory
store for a persistent one (e.g. `connect-sqlite3`, already-installed SQLite
works well for this) so sessions survive a restart, and consider a proper
`node-cron`-free job runner if you deploy multiple instances (otherwise every
instance will run its own check and send duplicate emails — the current setup
assumes a single process).

## Extending it

- **Barcode/VIN lookup on signup**: instead of asking people to type keywords,
  scan a UPC or VIN and pre-fill `criteria`. CPSC recalls don't include UPCs
  consistently, so keyword matching would still be the fallback.
- **Better matching**: `src/matcher.js` is deliberately simple (all-keywords
  substring match). A real product would want fuzzy matching, synonym
  handling, and maybe a small LLM pass over ambiguous matches before emailing.

## Project layout

```
src/
  server.js       Express app — auth, item CRUD, manual "check now", push/phone settings
  scheduler.js     Cron loop — fetches recalls per category, matches, emails, dedupes
  matcher.js       Keyword matching logic
  mailer.js        Email sending (nodemailer/SMTP)
  sms.js           SMS alerts (Twilio, optional)
  push.js          Web Push alerts (VAPID, optional)
  phone.js         Phone number normalization (E.164)
  db.js            SQLite schema + connection
  sources/
    cpsc.js        CPSC consumer product recalls
    nhtsa.js       NHTSA vehicle recalls (queried per vehicle)
    fda.js         openFDA food + drug enforcement reports
    usda.js        USDA FSIS meat/poultry/egg recalls
public/
  index.html, app.js, styles.css   Single-page dashboard (no build step)
  sw.js           Service worker — shows push notifications, handles taps
test/
  matcher.test.js  Unit tests for keyword matching
  phone.test.js    Unit tests for phone number normalization
  sms.test.js      Unit tests for SMS message building
  push.test.js     Unit + DB tests for push subscription storage
  server.test.js   End-to-end HTTP tests for the Express app
```
