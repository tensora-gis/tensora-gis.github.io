/**
 * Sign-in gate UI.
 *
 * Renders a full-screen sign-in card until the user authenticates with their
 * Google account (Google Identity Services). The auth state itself lives in
 * the useGoogleAuth hook; this component only renders and hands the GI
 * credential up via onAuthenticated.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Compass, TriangleAlert } from 'lucide-react';
import { isAuthConfigured, AuthSession } from './session';

const GIS_POLL_MS = 100;

function waitForGisClient(): Promise<boolean> {
  return new Promise((resolve) => {
    let waited = 0;
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve(true);
      } else if ((waited += GIS_POLL_MS) > 10_000) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, GIS_POLL_MS);
  });
}

export const SignInScreen: React.FC<{
  /** Resolves with the session once the credential validates, or null. */
  onAuthenticated: (credential: string) => Promise<AuthSession | null>;
}> = ({ onAuthenticated }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const configured = isAuthConfigured();

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let cancelled = false;
    void waitForGisClient().then((ok) => {
      if (cancelled || !ok || !buttonRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          setSubmitting(true);
          setWarning(null);
          void onAuthenticated(response.credential)
            .then((session) => setWarning(session ? null : 'Sign-in failed. Please try again.'))
            .finally(() => setSubmitting(false));
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 280,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#0a0a0a] p-8 shadow-2xl">
        <div className="mx-auto mb-5 flex w-fit items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#171717] border border-[#222] flex items-center justify-center text-amber-500">
            <Compass className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white font-tech">
              Tensora <span className="text-amber-500 text-xs font-mono font-medium">GIS</span>
            </span>
            <p className="text-[11px] text-[#737373] font-mono">
              Catchment &amp; Stream Delineation
            </p>
          </div>
        </div>

        <h1 className="text-center text-lg font-semibold text-white">
          {configured ? 'Sign in to continue' : 'Sign-in not configured yet'}
        </h1>
        <p className="mt-1.5 text-center text-xs leading-relaxed text-[#737373]">
          {configured ? (
            <>
              Use your Google account to sign in or sign up. First-time accounts
              are registered to the project sign-up sheet.
            </>
          ) : (
            <>
              This deployment has no Google sign-in configured yet — set{' '}
              <code className="mx-1 rounded bg-[#111] px-1 py-0.5 font-mono text-[10px] text-amber-400">
                VITE_GOOGLE_CLIENT_ID
              </code>{' '}
              (see docs/AUTH_SETUP.md).
            </>
          )}
        </p>

        <div className="mt-6 flex justify-center">
          <div ref={buttonRef} />
        </div>

        {warning && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[11px] leading-snug text-amber-400/90">{warning}</p>
          </div>
        )}

        {submitting && (
          <p className="mt-4 text-center text-[11px] text-[#737373] animate-pulse">
            Verifying your Google account…
          </p>
        )}
      </div>
    </div>
  );
};
