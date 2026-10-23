/**
 * Ambient declarations for the Google Identity Services client and the
 * build-time auth config injected by Vite (see .env.example).
 */

interface GoogleCredentialResponse {
  /** Base64url-encoded Google ID token (JWT). */
  credential: string;
  select_by?: string;
}

interface GoogleIdNamespace {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
}

interface GoogleNamespace {
  accounts: {
    id: GoogleIdNamespace;
  };
}

interface Window {
  google?: GoogleNamespace;
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_SIGNUP_ENDPOINT?: string;
}
