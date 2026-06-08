import { useState } from 'react';
import { AuthFetchError } from '../../api/auth';
import { useLogin } from '../../hooks/server/useLogin';
import { useSignup } from '../../hooks/server/useSignup';
import Button from '../shared/Button';
import IconButton from '../shared/IconButton';
import TextField from '../shared/TextField';

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

        <div
          role="tablist"
          aria-label="Authentication mode"
          className="ring-border/60 bg-surface-raised flex rounded-md p-1 ring-1"
        >
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
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
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errorMessage}
            trailing={
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </IconButton>
            }
          />

          <Button type="submit" block loading={active.isPending}>
            {active.isPending
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign in'
                : 'Sign up'}
          </Button>
        </form>

        {/* Reserve the row in both modes so the form doesn't jump when the
            mode toggle swaps the hint in or out. */}
        <p
          aria-hidden={mode !== 'signup'}
          className={`text-fg-subtle mt-4 text-center text-[11px] ${
            mode === 'signup' ? '' : 'invisible'
          }`}
        >
          Signup is invite-only. Ask the admin to add your email.
        </p>
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
