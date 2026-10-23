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
  loadSession,
  registerSignIn,
  saveSession,
  sessionFromCredential,
} from './session';

export type AppUser = AuthSession;

export function useGoogleAuth() {
  const [user, setUser] = useState<AppUser | null>(() => loadSession());
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null);

  const signIn = useCallback(
    async (credential: string): Promise<AuthSession | null> => {
      const existing = loadSession();
      const session = sessionFromCredential(
        { credential },
        existing?.sub ? existing.firstSeenAt : undefined
      );
      if (!session) return null;

      // Registration completes before the session is granted, and the
      // outcome is surfaced (see recordingWarning) so a sheet-recorder
      // outage is visible in-app rather than being swallowed.
      const outcome = await registerSignIn(credential);
      setRecordingWarning(outcome.warning ?? null);

      saveSession(session);
      setUser(session);
      return session;
    },
    []
  );

  const signOut = useCallback(() => {
    clearSession();
    setRecordingWarning(null);
    setUser(null);
  }, []);

  return { user, signIn, signOut, recordingWarning };
}
