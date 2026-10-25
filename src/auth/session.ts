/**
 * Session storage, ID-token decoding and signup registration.
 *
 * The Google Identity Services button issues an ID token (JWT). We decode the
 * payload for display purposes; authenticity is verified server-side by the
 * Apps Script web app (see docs/AUTH_SETUP.md) before a row reaches the sheet.
 */
export interface AuthSession {
  sub: string;
  name: string;
  email: string;
  picture?: string;
  firstSeenAt: string;
  signedInAt: string;
}

const SESSION_KEY = 'tensora.auth.session';

export function isAuthConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.sub && parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

export function saveSession(session: AuthSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable — session will not persist, but signing in still works */
  }
}

interface IdTokenPayload {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

/** Extracts the JWT payload without touching the network. */
export function decodeIdToken(credential: string): IdTokenPayload | null {
  try {
    const payload = credential.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as IdTokenPayload;
  } catch {
    return null;
  }
}

export interface RegistrationResult {
  recorded: boolean;
  action?: 'signup' | 'signin';
  warning?: string;
}

/**
 * HANDSHAKE: registers the sign-in with the Apps Script endpoint, which
 * verifies the ID token against Google and appends a row to the signup sheet.
 *
 * The request is sent with a text/plain content type so the browser issues a
 * simple cross-origin POST (no CORS preflight — Apps Script web apps reject
 * preflights).
 */
export async function registerSignIn(
  credential: string
): Promise<RegistrationResult> {
  const endpoint = import.meta.env.VITE_SIGNUP_ENDPOINT;
  if (!endpoint) {
    console.warn('VITE_SIGNUP_ENDPOINT not set — sign-in not recorded to sheet.');
    return { recorded: false, warning: 'Signup sheet is not configured.' };
  }

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ credential }),
    });
    if (!resp.ok) {
      return { recorded: false, warning: `Sign-up recording failed (HTTP ${resp.status}).` };
    }
    const data = (await resp.json()) as { status?: string; action?: string };
    if (data.status !== 'ok') {
      return { recorded: false, warning: 'The sign-up recording was rejected.' };
    }
    return { recorded: true, action: data.action === 'signup' ? 'signup' : 'signin' };
  } catch {
    return { recorded: false, warning: 'Could not reach the signup sheet (offline?).' };
  }
}

/** Builds the session record from a GIS credential response. */
export function sessionFromCredential(
  response: { credential: string },
  firstSeenAt?: string
): AuthSession | null {
  const payload = decodeIdToken(response.credential);
  if (!payload?.sub || !payload.email) return null;
  const now = new Date().toISOString();
  return {
    sub: payload.sub,
    name: payload.name || payload.email.split('@')[0],
    email: payload.email,
    picture: payload.picture,
    firstSeenAt: firstSeenAt ?? now,
    signedInAt: now,
  };
}
