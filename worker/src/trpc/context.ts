import type { Db } from '../db/client';

export type Context = {
  db: Db;
  images: R2Bucket;
  anthropicKey: string;
  // Null when the binding isn't configured (free tier, local dev without
  // the [[unsafe.bindings]] block). Procedures skip the .limit() call.
  parseLimiter: RateLimit | null;
  clientIp: string;
  // Populated by `createContext` from the session cookie. Null when the
  // request is unauthenticated; `protectedProcedure` narrows it to a string.
  userId: string | null;
  sessionId: string | null;
};
