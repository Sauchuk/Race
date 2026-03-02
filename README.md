# Sauchuk Corn Maze QR Race

Standalone mobile-first web app + Vercel serverless API for a checkpoint QR race at `race.sauchukmaze.com`.

## Features

- Vanilla frontend in `public/` (HTML/CSS/JS).
- Camera QR scanning using `html5-qrcode` with rear camera preference.
- QR payload parsing supports:
  - `https://race.sauchukmaze.com/scan?cp=C1&tok=ABC123`
  - `cp=C1;tok=ABC123`
- Game rules enforced client and server side:
  - START, C1, C2, C3, C4, FINISH
  - START begins timer
  - ignore scans before START (except START)
  - FINISH requires C1-C4
  - duplicate checkpoint scans ignored
  - minimum valid completion: 180s
- Demo Mode buttons for desktop testing.
- Two leaderboards (today + all-time top 10).
- Server-side best-per-name-per-day enforcement.
- Basic rate limiting on score submissions by device hash + IP.

## Project structure

- `public/index.html` - UI and app layout
- `public/styles.css` - mobile-first outdoor-readable styling
- `public/app.js` - race state machine, scanner flow, submit flow, leaderboard rendering
- `api/validateScan.js` - validates `{cp,tok}` against checkpoint token map
- `api/submitRun.js` - validates run, rate limits, saves run and leaderboard entries in KV
- `api/leaderboard.js` - returns top 10 rows for `today` or `alltime`
- `data/checkpoints.json` - checkpoint token map
- `tools/rotate_tokens.js` - rotates tokens and emits printable QR URL CSV

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Ensure Vercel KV is configured (see below) and environment variables are available.

3. Run local app with Vercel:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

## Deploy on Vercel

1. Push this repo to GitHub.
2. In Vercel, import the repo as a project.
3. Set project root to `/` (default).
4. Add environment variables for KV:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
5. Deploy.

## Add custom domain `race.sauchukmaze.com`

1. In Vercel project settings, open **Domains**.
2. Add `race.sauchukmaze.com`.
3. Create/verify required DNS records at your DNS provider.
4. Wait for SSL/TLS certificate issuance.

## Enable Vercel KV

1. In Vercel dashboard, open **Storage**.
2. Create a **KV** database.
3. Connect it to this project.
4. Confirm env vars exist in project settings:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
5. Redeploy if needed.

## Rotate tokens + print QR codes

Rotate tokens and generate QR URL CSV:

```bash
npm run rotate:tokens
```

This updates `data/checkpoints.json` and writes a CSV file like:

- `data/qr_urls_YYYY-MM-DD.csv`

CSV format:

- `checkpoint,qr_url`

Example row:

- `START,https://race.sauchukmaze.com/scan?cp=START&tok=...`

Use that CSV to bulk-generate and print QR codes.

## HTTPS requirement for camera permissions

Mobile camera access in Safari/Chrome requires HTTPS (or `localhost` during local development). Always use HTTPS on production domain.
