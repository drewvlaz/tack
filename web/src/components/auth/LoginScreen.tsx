import { useState } from 'react';
import { AuthFetchError } from '../../api/auth';
import { useLogin } from '../../hooks/server/useLogin';
import { useSignup } from '../../hooks/server/useSignup';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const signup = useSignup();
  const active = mode === 'login' ? login : signup;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    active.mutate({ email: email.trim(), password });
  }

  const errorMessage =
    active.error instanceof AuthFetchError
      ? active.error.message
      : active.error
        ? 'Something went wrong. Try again.'
        : null;

  return (
    <div className="bg-surface flex h-screen w-screen items-center justify-center">
      <div className="w-full max-w-sm px-8">
        <p className="text-fg-subtle mb-8 text-center text-[11px] font-medium tracking-[0.18em] uppercase">
          Tack
        </p>

        <div className="ring-border/60 bg-surface-raised flex rounded-md p-1 ring-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-surface-muted text-fg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-fg-muted block pb-1 text-xs">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-surface-raised text-fg ring-border/60 focus:ring-border w-full rounded-md px-3 py-2 text-sm ring-1 outline-none"
            />
          </label>
          <label className="block">
            <span className="text-fg-muted block pb-1 text-xs">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-surface-raised text-fg ring-border/60 focus:ring-border w-full rounded-md px-3 py-2 pr-9 text-sm ring-1 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="text-fg-subtle hover:text-fg absolute inset-y-0 right-0 flex w-9 items-center justify-center"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          {errorMessage && (
            <p className="text-xs text-red-500" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={active.isPending}
            className="bg-fg text-surface w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {active.isPending
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign in'
                : 'Sign up'}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="text-fg-subtle mt-4 text-center text-[11px]">
            Signup is invite-only. Ask the admin to add your email.
          </p>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 2l10 10M5.2 5.2A6.8 6.8 0 0 0 1 7s2.2 4 6 4c1 0 1.9-.2 2.7-.6M8.7 8.7a1.6 1.6 0 0 1-2.4-2.1M11 9.4c1.4-1 2-2.4 2-2.4s-2.2-4-6-4c-.6 0-1.2.1-1.8.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
