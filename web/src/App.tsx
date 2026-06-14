import { useState } from 'react';
import AppUI from './components/AppUI';
import AuthGate from './components/auth/AuthGate';
import Canvas from './components/Canvas/Canvas';
import ImportScreen from './components/Import/ImportScreen';
import InviteScreen from './components/Invite/InviteScreen';
import Toaster from './components/Toaster';

// Simple path-based route. Two non-default paths:
//   - `/i/{token}`   invite acceptance (logged-in shortcut + signup-with-token)
//   - `/import`      bookmarklet drop-zone (postMessage receiver)
// After both finish their job we replaceState to '/' and the main app
// mounts. No router library yet — three paths is the whole surface.
function parseInviteToken(): string | null {
  const m = window.location.pathname.match(/^\/i\/(.+?)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function isImportPath(): boolean {
  return /^\/import\/?$/.test(window.location.pathname);
}

export default function App() {
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    parseInviteToken(),
  );
  const [importMode] = useState<boolean>(() => isImportPath());

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

  if (importMode) {
    // Import flow needs auth (parseFromHtml + addItem are protectedProcedure)
    // but stays on /import after sign-in so the bookmarklet's postMessage
    // handshake still works.
    return (
      <AuthGate>
        <ImportScreen />
      </AuthGate>
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
