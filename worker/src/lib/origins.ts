// Single source of truth for which origins this worker accepts authenticated
// traffic from. Consumed by both the CORS middleware (response-side, browser-
// enforced) and the CSRF middleware (request-side, server-enforced) so a CORS
// misconfig can't silently widen the attack surface — the server-side check
// is the backstop.

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

export function isAllowedOrigin(
  origin: string | null | undefined,
  env: { FRONTEND_ORIGIN?: string },
): boolean {
  if (!origin) {
    return false;
  }
  if (DEV_ORIGINS.has(origin)) {
    return true;
  }
  if (env.FRONTEND_ORIGIN && origin === env.FRONTEND_ORIGIN) {
    return true;
  }
  return false;
}
