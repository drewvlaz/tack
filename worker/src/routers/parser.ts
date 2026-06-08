import { TRPCError } from '@trpc/server';
import { UnsafeUrlError } from '../lib/safeFetch';
import { ParseResultSchema, ParseUrlBody } from '../schemas/parse';
import { ParseFetchError, parseProductUrl } from '../services/parser';
import { protectedProcedure } from '../trpc/init';

export const parseUrlProcedure = protectedProcedure
  .input(ParseUrlBody)
  .mutation(async ({ ctx, input }) => {
    // Bound the most-expensive procedure per IP. Each call is HTML fetch +
    // paid Claude tokens + up to 12 image downloads — easy to weaponize.
    // Auth gates access (only logged-in users hit this), but per-IP limiting
    // still bounds a compromised account.
    const { success } = await ctx.parseLimiter.limit({ key: ctx.clientIp });
    if (!success) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many parse requests. Try again in a minute.',
      });
    }

    try {
      const result = await parseProductUrl(
        input.url,
        ctx.anthropicKey,
        ctx.images,
      );
      return ParseResultSchema.parse(result);
    } catch (err) {
      // Upstream-site problems are user-fixable (try another URL); surface
      // them as BAD_REQUEST with a clear message rather than a generic 500.
      if (err instanceof UnsafeUrlError) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That URL isn’t allowed.',
        });
      }
      if (err instanceof ParseFetchError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }
  });
