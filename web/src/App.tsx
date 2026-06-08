import AuthGate from './components/auth/AuthGate';
import AppUI from './components/AppUI';
import Canvas from './components/Canvas/Canvas';
import Toaster from './components/Toaster';

export default function App() {
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
