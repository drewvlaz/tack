import type { Db } from '../db/client';

export type Context = {
  db: Db;
  images: R2Bucket;
  anthropicKey: string;
  parseLimiter: RateLimit;
  clientIp: string;
  // Populated by `createContext` from the session cookie. Null when the
  // request is unauthenticated; `protectedProcedure` narrows it to a string.
  userId: string | null;
  sessionId: string | null;
};
