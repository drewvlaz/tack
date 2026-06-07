import { ParseResultSchema, ParseUrlBody } from '../schemas/parse';
import { parseProductUrl } from '../services/parser';
import { publicProcedure } from '../trpc/init';

export const parseUrlProcedure = publicProcedure
  .input(ParseUrlBody)
  .mutation(async ({ ctx, input }) => {
    const result = await parseProductUrl(
      input.url,
      ctx.anthropicKey,
      ctx.images,
    );
    return ParseResultSchema.parse(result);
  });
