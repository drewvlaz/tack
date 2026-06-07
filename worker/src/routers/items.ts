import { z } from 'zod';
import { reparseItem } from '../services/items';
import { publicProcedure, router } from '../trpc/init';

export const itemsRouter = router({
  reparse: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      reparseItem(ctx.db, ctx.images, input.id, ctx.anthropicKey),
    ),
});
