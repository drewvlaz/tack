import { TRPCError } from '@trpc/server';
import { ParseResultSchema, ParseUrlBody } from '../schemas/parse';
import { parseProductUrl } from '../services/parser';
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

    const result = await parseProductUrl(
      input.url,
      ctx.anthropicKey,
      ctx.images,
    );
    return ParseResultSchema.parse(result);
  });
