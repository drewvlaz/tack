import { z } from 'zod';
import { reparseItem, setPrimaryImage } from '../services/items';
import { publicProcedure, router } from '../trpc/init';

export const itemsRouter = router({
  reparse: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      reparseItem(ctx.db, ctx.images, input.id, ctx.anthropicKey),
    ),
  setPrimaryImage: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        imageId: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setPrimaryImage(ctx.db, input.itemId, input.imageId),
    ),
});
