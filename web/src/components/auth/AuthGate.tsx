import type { ReactNode } from 'react';
import { useMe } from '../../hooks/server/useMe';
import LoginScreen from './LoginScreen';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return <div className="bg-surface h-screen w-screen" />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
