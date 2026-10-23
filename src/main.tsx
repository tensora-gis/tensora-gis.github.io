import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {useGoogleAuth} from './auth/useGoogleAuth';
import {SignInScreen} from './auth/SignInScreen';

function Root() {
  const {user, signIn, signOut, continueUnconfigured} = useGoogleAuth();

  if (!user) {
    return (
      <SignInScreen
        onAuthenticated={signIn}
        onContinueUnconfigured={continueUnconfigured}
      />
    );
  }
  return <App user={user} onSignOut={signOut} />;
}

createRoot(document.getElementById('root')!).render(<Root />);
