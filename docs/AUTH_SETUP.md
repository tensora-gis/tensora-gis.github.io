# Google Sign-In / Sign-Up setup

The site gates on Google account authentication. First-time users are
recorded to a Google Sheet in the project owner's Drive.

```
Browser (SPA)                 Google                     Apps Script            Google Sheet
────── |                   ────── |                    ─────────────────      ───────────ﻩ
  1. GIS button → consent ───▶
  2. receives ID token (JWT) ◀──
  3. decodes JWT for display
  4. POST /exec {credential} ─────────────────────────────▶ verifies token:
       text/plain (no CORS                           aud = this app's client id
       preflight — Apps Script                       iss = accounts.google.com
       limitations)                                  exp … not expired
       email_verified
                                                ──▶ append/update row ─▶ Signups sheet
  5. session cached in localStorage (returning users skip the gate)
```

The ID token is **verified server-side** by the Apps Script — the client-side
decode is only for display. A token minted for another app, an expired token,
or an email Google hasn't verified never reaches the sheet.

## Step 1 — OAuth Client ID (Google Cloud Console)

1. Go to <https://console.cloud.google.com/apis/credentials> (any Google Cloud
   project works; create one if needed).
2. Configure the **OAuth consent screen**: External, add the app name, support
   email, and the developer contact. No scopes beyond `openid`, `email`,
   `profile` are requested (non-sensitive, no verification review needed).
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. Under *Authorized JavaScript origins* add:
   ```
   https://tensora-gis.github.io
   ```
   (and `http://localhost:3000` for local development).
5. Copy the generated Client ID (`…apps.googleusercontent.com`).

## Step 2 — Apps Script web app (writes to the sign-up sheet)

The register is this spreadsheet:
<https://docs.google.com/spreadsheets/d/1jc5-gV42WqCiiRWxxjfd4-uIqhbYBwKodEXcAmjM43Y/edit#gid=0>
(columns: **Timestamp, Name, Email, Source**).

1. Open <https://script.google.com/home/create> (a standalone script is fine —
   it opens the spreadsheet by ID) — or use Extensions → **Apps Script** inside
   the sheet itself.
2. Delete the default code, paste in
   [`apps-script/Code.gs`](../apps-script/Code.gs), and set `CLIENT_ID` at the
   top to the Client ID from Step 1. (`SPREADSHEET_ID` and `SOURCE` are already
   filled in.)
3. Save, then **Deploy → New deployment → type: Web app**:
   - Description: `tensora-gis signup recorder`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize the deployment (it writes only to the sign-up spreadsheet).
5. Copy the web app URL — it ends in `/exec`.

## Step 3 — Wire the repo secrets

The values are build-time injected, so they live as GitHub Actions secrets in
this repo (`tensora-gis/tensora-gis.github.io`):

```bash
gh secret set VITE_GOOGLE_CLIENT_ID   --body "YOUR_CLIENT_ID.apps.googleusercontent.com"
gh secret set VITE_SIGNUP_ENDPOINT    --body "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
gh workflow run deploy-pages.yml      # rebuild with the new secrets
```

Locally, copy `.env.example` to `.env.local` and fill in the same two values.

## Behaviour notes

- Every sign-in writes **Timestamp, Name, Email, Source** to the register;
  Source records where the sign-in happened (`https://tensora-gis.github.io`).
- An account already in the sheet has its Timestamp refreshed instead of
  getting a duplicate row (10-minute dedupe window); new accounts append.
- The ID token is verified against Google before any row is written;
  unverified/expired/mismatched tokens are rejected with 403.
- Returning users are stored in `localStorage` and skip the gate on repeat
  visits; clearing site data (or pressing **Sign out**) returns them to the
  sign-in screen.
- If the Apps Script endpoint is unreachable (offline, quota), sign-in still
  succeeds locally and the failure is logged in the console — the sheet is
  signup telemetry, not an access-control list.
- Guest access (`Continue without an account`) only appears on deployments
  where `VITE_GOOGLE_CLIENT_ID` is not set (e.g. fresh forks).
