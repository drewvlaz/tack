import { useEffect, useRef, useState } from 'react';
import { AuthFetchError } from '../../api/auth';
import { useAcceptInvite } from '../../hooks/server/useAcceptInvite';
import { useLogin } from '../../hooks/server/useLogin';
import { useMe } from '../../hooks/server/useMe';
import { useSignup } from '../../hooks/server/useSignup';
import { useBoardsStore } from '../../store/boards';
import Button from '../shared/Button';
import IconButton from '../shared/IconButton';
import TextField from '../shared/TextField';

type Mode = 'login' | 'signup';

// Landing for `/i/:token`. Three branches:
//   1. Logged in: one-click accept, then drop into the board.
//   2. Logged out (login tab): credentials → login → auto-accept → drop in.
//   3. Logged out (signup tab): credentials + token → signup-with-bypass
//      atomically grants membership and returns invitedBoardId; we skip the
//      separate accept step.
//
// `onAccepted` lets the parent (App) swap us out for the main canvas + clean
// the URL (replaceState '/'). We also pre-set activeBoardId so the canvas
// opens on the joined board.
export default function InviteScreen({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: (boardId: string) => void;
}) {
  const { data: me, isLoading: meLoading } = useMe();
  const accept = useAcceptInvite();
  const login = useLogin();
  const signup = useSignup();
  const setActiveBoardId = useBoardsStore((s) => s.setActiveBoardId);

  // Logged-in path: kick off the accept exactly once when we know who the
  // user is. The ref guards against StrictMode double-effects and against
  // accept being slow (React re-rendering while mutation is in-flight would
  // otherwise re-fire).
  const acceptedRef = useRef(false);
  useEffect(() => {
    if (meLoading || !me || acceptedRef.current) {
      return;
    }
    acceptedRef.current = true;
    accept.mutate(token, {
      onSuccess: ({ boardId }) => {
        setActiveBoardId(boardId);
        onAccepted(boardId);
      },
      onError: () => {
        // Surface the error in the rendered tree; reset the guard so the
        // user can manually retry if they fix something.
        acceptedRef.current = false;
      },
    });
  }, [me, meLoading, token, accept, setActiveBoardId, onAccepted]);

  if (meLoading) {
    return <div className="bg-surface h-screen w-screen" />;
  }

  if (me) {
    return (
      <Card title="Joining board…" subtitle={`Signed in as ${me.email}`}>
        {accept.error ? (
          <div className="space-y-3">
            <p className="text-danger text-xs">
              {accept.error instanceof Error
                ? accept.error.message
                : 'Invite link is invalid.'}
            </p>
            <Button
              block
              onClick={() => {
                acceptedRef.current = false;
                accept.mutate(token, {
                  onSuccess: ({ boardId }) => {
                    setActiveBoardId(boardId);
                    onAccepted(boardId);
                  },
                });
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-fg-muted text-xs">Hang tight…</p>
        )}
      </Card>
    );
  }

  return (
    <LoggedOutInvite
      token={token}
      login={login}
      signup={signup}
      onSignupAccepted={(boardId) => {
        setActiveBoardId(boardId);
        onAccepted(boardId);
      }}
      onLoginAccepted={() => {
        // Once the cookie is set we re-render and the logged-in branch above
        // takes over (it calls accept.mutate). Force the useMe query to
        // refetch so we don't wait on staleTime.
      }}
    />
  );
}

function LoggedOutInvite({
  token,
  login,
  signup,
  onSignupAccepted,
}: {
  token: string;
  login: ReturnType<typeof useLogin>;
  signup: ReturnType<typeof useSignup>;
  onSignupAccepted: (boardId: string) => void;
  onLoginAccepted: () => void;
}) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const active = mode === 'login' ? login : signup;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'login') {
      // Pure login; the parent's logged-in effect will fire acceptInvite.
      login.mutate({ email: email.trim(), password });
    } else {
      // Signup-with-token: server bypasses INVITE_EMAILS and creates the
      // membership atomically. Response carries invitedBoardId.
      signup.mutate(
        { email: email.trim(), password, inviteToken: token },
        {
          onSuccess: (res) => {
            if (res.invitedBoardId) {
              onSignupAccepted(res.invitedBoardId);
            }
          },
        },
      );
    }
  }

  const errorMessage =
    active.error instanceof AuthFetchError
      ? active.error.message
      : active.error
        ? 'Something went wrong. Try again.'
        : null;

  return (
    <Card
      title="You've been invited"
      subtitle="Sign in or create an account to join the board."
    >
      <div
        role="tablist"
        aria-label="Authentication mode"
        className="ring-border/60 bg-surface-raised mb-4 flex rounded-md p-1 ring-1"
      >
        {(['signup', 'login'] as const).map((m) => (
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
            {m === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
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
              ? 'Sign in & join'
              : 'Create account & join'}
        </Button>
      </form>
    </Card>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface flex h-screen w-screen items-center justify-center">
      <div className="w-full max-w-sm px-8">
        <p className="text-fg-subtle mb-8 text-center text-[11px] font-medium tracking-[0.18em] uppercase">
          Tack
        </p>
        <h1 className="text-fg mb-1 text-base font-medium">{title}</h1>
        {subtitle && <p className="text-fg-muted mb-6 text-xs">{subtitle}</p>}
        {children}
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
