import { useState } from 'react';
import AppUI from './components/AppUI';
import AuthGate from './components/auth/AuthGate';
import Canvas from './components/Canvas/Canvas';
import InviteScreen from './components/Invite/InviteScreen';
import Toaster from './components/Toaster';

// Simple path-based route: when the URL is `/i/{token}` we render the
// invite landing instead of the main app. After acceptance we replaceState
// to '/' and clear the local flag so the app mounts normally. No router
// library yet — one path is the whole surface.
function parseInviteToken(): string | null {
  const m = window.location.pathname.match(/^\/i\/(.+?)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    parseInviteToken(),
  );

  if (inviteToken) {
    return (
      <InviteScreen
        token={inviteToken}
        onAccepted={() => {
          window.history.replaceState(null, '', '/');
          setInviteToken(null);
        }}
      />
    );
  }

  return (
    <AuthGate>
      <div className="relative h-screen w-screen overflow-hidden">
        <Canvas />
        <AppUI />
        <Toaster />
      </div>
    </AuthGate>
  );
}
