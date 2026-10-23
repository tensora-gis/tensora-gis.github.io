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

const SIGNUP_SHEET_NAME = 'Signups';
const HEADERS = [
  'Last activity',
  'Event',
  'Google ID (sub)',
  'Name',
  'Email',
  'Picture URL',
  'Sign-up time',
  'Sign-in count',
  'Verified',
];

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SIGNUP_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SIGNUP_SHEET_NAME);
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
 * Updates the row for an existing account, or appends a fresh one.
 * The Sign-up time column keeps the original registration; other columns
 * track the latest sign-in.
 */
function recordSignIn_(claims) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const subColumn = data.length > 0 ? data[0].indexOf('Google ID (sub)') : -1;
  const now = new Date();

  if (subColumn >= 0) {
    for (let r = 1; r < data.length; r++) {
      if (data[r][subColumn] !== claims.sub) continue;
      sheet.getRange(r + 1, 1).setValue(now); // Last activity
      sheet.getRange(r + 1, 5).setValue(claims.email);
      sheet.getRange(r + 1, 8).setValue((Number(data[r][7]) || 0) + 1); // Count
      sheet.getRange(r + 1, 9).setValue('yes'); // Verified
      return { action: 'signin', count: Number(data[r][7]) + 1 };
    }
  }

  sheet.appendRow([
    now,
    'signup',
    claims.sub,
    claims.name || '',
    claims.email,
    claims.picture || '',
    now,
    1,
    'yes',
  ]);
  return { action: 'signup', count: 1 };
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
      count: outcome.count,
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
