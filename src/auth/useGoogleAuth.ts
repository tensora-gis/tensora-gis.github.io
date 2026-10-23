/**
 * Application-level auth state.
 *
 * Sessions persist in localStorage so returning users skip the gate. First-
 * time sign-ups are recorded to the owner's Google Sheet through the Apps
 * Script web app; a recording failure surfaces as a warning but never locks
 * an authenticated user out (the sheet is signup telemetry, not an ACL).
 */
import { useCallback, useState } from 'react';
import {
  AuthSession,
  clearSession,
  isAuthConfigured,
  loadSession,
  registerSignIn,
  saveSession,
  sessionFromCredential,
} from './session';

export type AppUser = AuthSession | { guest: true };

export function useGoogleAuth() {
  const [user, setUser] = useState<AppUser | null>(() => loadSession());

  const signIn = useCallback(async (credential: string): Promise<AuthSession | null> => {
    const existing = loadSession();
    const session = sessionFromCredential(
      { credential },
      existing?.sub ? existing.firstSeenAt : undefined
    );
    if (!session) return null;

    saveSession(session);
    setUser(session);

    const outcome = await registerSignIn(credential);
    if (outcome.warning) console.warn('Signup recording:', outcome.warning);
    return session;
  }, []);

  const continueUnconfigured = useCallback(() => {
    if (isAuthConfigured()) return;
    setUser({ guest: true });
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return { user, signIn, signOut, continueUnconfigured };
}
