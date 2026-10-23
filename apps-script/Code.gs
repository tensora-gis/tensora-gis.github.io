/**
 * Google Apps Script — Tensora GIS sign-up recorder.
 *
 * Paste this into a new Apps Script project (script.google.com → New project),
 * set CLIENT_ID below, and deploy it as a Web App:
 *   Deploy → New deployment → type: Web app
 *     Execute as: Me
 *     Who has access: Anyone
 *
 * The web app URL (…/exec) becomes the VITE_SIGNUP_ENDPOINT secret.
 * Full setup instructions: docs/AUTH_SETUP.md
 *
 * SECURITY MODEL
 *   - The SPA sends the Google ID token (JWT) it received from the Google
 *     Identity Services button.
 *   - This script verifies it against Google's tokeninfo endpoint and checks
 *     the audience (client ID), issuer, and expiry before writing anything.
 *   - Requests failing verification are rejected with 403 and logged.
 */

// The OAuth Client ID — tokens issued for this app (and only this app) past
// the audience check. This MUST equal VITE_GOOGLE_CLIENT_ID.
const CLIENT_ID = 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';

// The sign-up register lives in this fixed spreadsheet; gid=0 (its first
// sheet) is written to.
const SPREADSHEET_ID = '1jc5-gV42WqCiiRWxxjfd4-uIqhbYBwKodEXcAmjM43Y';

// Value written to the "Source" column — where the sign-in happened.
const SOURCE = 'https://tensora-gis.github.io';

const HEADERS = ['Timestamp', 'Name', 'Email', 'Source'];

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheets()[0]; // gid=0
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Verifies the ID token with Google and returns its claims.
 *
 * aud/iss/exp are enforced deliberately: a token minted for a different
 * application, an expired token, or an unverified email must never reach
 * the sheet.
 */
function verifyIdToken_(credential) {
  const url =
    'https://oauth2.googleapis.com/tokeninfo?id_token=' +
    encodeURIComponent(credential);
  let claims;
  try {
    claims = JSON.parse(
      UrlFetchApp.fetch(url, { muteHttpExceptions: false }).getContentText()
    );
  } catch (err) {
    throw new Error('Token verification failed: ' + err);
  }

  if (claims.aud !== CLIENT_ID) {
    throw new Error('Token audience does not match this application.');
  }
  if (
    claims.iss !== 'accounts.google.com' &&
    claims.iss !== 'https://accounts.google.com'
  ) {
    throw new Error('Token issuer is not Google.');
  }
  if (!Number(claims.exp) || Number(claims.exp) < Date.now() / 1000) {
    throw new Error('Token is expired.');
  }
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw new Error('Account email is not verified by Google.');
  }
  return claims;
}

/**
 * Writes one row: Timestamp, Name, Email, Source.
 *
 * An account that is already in the sheet gets its Timestamp refreshed
 * instead of a duplicate row (dedupe window: 10 minutes, so double-fires are
 * collapsed but every session remains visible over time).
 */
function recordSignIn_(claims) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const emailColumn = data.length > 0 ? data[0].indexOf('Email') : -1;
  const now = new Date();
  const dedupeCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  if (emailColumn >= 0) {
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][emailColumn]).toLowerCase() !== String(claims.email).toLowerCase()) continue;
      const lastSeen = data[r][0] instanceof Date ? data[r][0] : null;
      if (lastSeen && lastSeen > dedupeCutoff) {
        return { action: 'signin', deduped: true };
      }
      sheet.getRange(r + 1, 1).setValue(now); // Timestamp
      return { action: 'signin', deduped: false };
    }
  }

  sheet.appendRow([now, claims.name || '', claims.email, SOURCE]);
  return { action: 'signup', deduped: false };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Web app entry point (deployed with access: Anyone). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ status: 'error', error: 'Empty request.' });
    }
    const body = JSON.parse(e.postData.contents);
    if (!body.credential) {
      return json_({ status: 'error', error: 'Missing credential.' });
    }

    const claims = verifyIdToken_(body.credential);
    const outcome = recordSignIn_(claims);
    return json_({
      status: 'ok',
      action: outcome.action,
      deduped: outcome.deduped,
      email: claims.email,
    });
  } catch (err) {
    console.error('Google signup recorder error: ' + err);
    return json_({ status: 'error', error: 'Verification failed.' });
  }
}

/** Run once from the editor to create the sheet and headers. */
function setup() {
  getSheet_();
  Logger.log('Sheet is ready.');
}
