const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export type User = { id: string; email: string };

export class AuthFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function authFetch<T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: unknown },
): Promise<T> {
  const { body, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE}/api/auth${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      // ignore malformed JSON
    }
    throw new AuthFetchError(
      res.status,
      payload.error ?? 'unknown_error',
      payload.message ?? `Request failed (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

// Signup response carries an `invitedBoardId` when the user redeemed an
// invite token during signup, so the caller can jump straight to that board.
export type SignupResponse = User & { invitedBoardId?: string };

export function signup(
  email: string,
  password: string,
  inviteToken?: string,
): Promise<SignupResponse> {
  return authFetch<SignupResponse>('/signup', {
    method: 'POST',
    body: {
      email,
      password,
      ...(inviteToken !== undefined ? { inviteToken } : {}),
    },
  });
}

export function login(email: string, password: string): Promise<User> {
  return authFetch<User>('/login', { method: 'POST', body: { email, password } });
}

export function logout(): Promise<{ ok: true }> {
  return authFetch<{ ok: true }>('/logout', { method: 'POST' });
}

export function fetchMe(): Promise<User> {
  return authFetch<User>('/me');
}
