import type { Db } from '../db/client';

export type Context = {
  db: Db;
  images: R2Bucket;
  anthropicKey: string;
  parseLimiter: RateLimit;
  clientIp: string;
};
