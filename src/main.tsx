import { useEffect, useState } from 'react';
import {createRoot} from 'react-dom/client';
import { TriangleAlert } from 'lucide-react';
import App from './App.tsx';
import './index.css';
import {useGoogleAuth} from './auth/useGoogleAuth';
import {SignInScreen} from './auth/SignInScreen';

function RecorderToast({message}: {message: string}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-md items-start gap-2 rounded-xl border border-amber-500/30 bg-[#171717] px-4 py-3 shadow-2xl">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div>
        <p className="text-xs font-semibold text-amber-400">Sign-up not recorded</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[#a3a3a3]">{message}</p>
      </div>
    </div>
  );
}

function Root() {
  const {user, signIn, signOut, recordingWarning} = useGoogleAuth();

  if (!user) {
    return <SignInScreen onAuthenticated={signIn} />;
  }
  return (
    <>
      <App user={user} onSignOut={signOut} />
      {recordingWarning && <RecorderToast message={recordingWarning} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
