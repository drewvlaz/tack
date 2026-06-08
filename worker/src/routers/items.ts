import { z } from 'zod';
import { withTransaction } from '../db/tx';
import { reparseItem, setPrimaryImage } from '../services/items';
import { publicProcedure, router } from '../trpc/init';

export const itemsRouter = router({
  reparse: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, (tx) =>
        reparseItem(tx, input.id, ctx.anthropicKey),
      ),
    ),
  setPrimaryImage: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        imageId: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, (tx) =>
        setPrimaryImage(tx, input.itemId, input.imageId),
      ),
    ),
});
