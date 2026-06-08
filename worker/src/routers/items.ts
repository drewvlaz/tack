import { z } from 'zod';
import { withTransaction } from '../db/tx';
import { reparseItem, setPrimaryImage } from '../services/items';
import { protectedProcedure, router } from '../trpc/init';

export const itemsRouter = router({
  reparse: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        reparseItem(tx, input.id, ctx.anthropicKey),
      ),
    ),
  setPrimaryImage: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        imageId: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        setPrimaryImage(tx, input.itemId, input.imageId),
      ),
    ),
});
