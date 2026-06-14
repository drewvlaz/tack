import { TRPCError } from '@trpc/server';
import { UnsafeUrlError } from '../lib/safeFetch';
import {
  ParseFromHtmlBody,
  ParseResultSchema,
  ParseUrlBody,
} from '../schemas/parse';
import {
  ParseFetchError,
  parseProductFromHtml,
  parseProductUrl,
} from '../services/parser';
import type { Context } from '../trpc/context';
import { protectedProcedure } from '../trpc/init';

// Shared rate-limit + error mapping. Both parse paths are expensive (paid
// Claude tokens + up to 12 image downloads), and the bookmarklet path is
// also bandwidth-heavy (the user uploads the full rendered HTML).
async function consumeParseLimiter(
  ctx: Pick<Context, 'parseLimiter' | 'clientIp'>,
): Promise<void> {
  if (!ctx.parseLimiter) {
    return;
  }
  const { success } = await ctx.parseLimiter.limit({ key: ctx.clientIp });
  if (!success) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many parse requests. Try again in a minute.',
    });
  }
}

function mapParseError(err: unknown): never {
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

export const parseUrlProcedure = protectedProcedure
  .input(ParseUrlBody)
  .mutation(async ({ ctx, input }) => {
    await consumeParseLimiter(ctx);
    try {
      const result = await parseProductUrl(
        input.url,
        ctx.anthropicKey,
        ctx.images,
        ctx.userId,
      );
      return ParseResultSchema.parse(result);
    } catch (err) {
      mapParseError(err);
    }
  });

// Bookmarklet endpoint. Takes the rendered DOM from the user's browser tab
// and runs it through the parser pipeline without re-fetching — the whole
// point is that the live URL is bot-blocked (Akamai / DataDome). Same rate
// limit and same Claude budget as `parseUrl`.
export const parseFromHtmlProcedure = protectedProcedure
  .input(ParseFromHtmlBody)
  .mutation(async ({ ctx, input }) => {
    await consumeParseLimiter(ctx);
    try {
      const result = await parseProductFromHtml(
        input.url,
        input.html,
        ctx.anthropicKey,
        ctx.images,
        ctx.userId,
      );
      return ParseResultSchema.parse(result);
    } catch (err) {
      mapParseError(err);
    }
  });
