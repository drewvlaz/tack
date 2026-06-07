import { z } from 'zod';
import { AddItemBody, PatchBoardItemBody } from '../schemas/board';
import {
  addBoardItem,
  deleteBoardItem,
  listBoardItems,
  patchBoardItem,
} from '../services/boards';
import { publicProcedure, router } from '../trpc/init';

export const boardsRouter = router({
  getItems: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ ctx, input }) => listBoardItems(ctx.db, input.boardId)),

  patchItem: publicProcedure
    .input(z.object({ id: z.string(), patch: PatchBoardItemBody }))
    .mutation(async ({ ctx, input }) => {
      await patchBoardItem(ctx.db, input.id, input.patch);
      return { ok: true as const };
    }),

  addItem: publicProcedure
    .input(z.object({ boardId: z.string(), item: AddItemBody }))
    .mutation(({ ctx, input }) =>
      addBoardItem(ctx.db, input.boardId, input.item),
    ),

  deleteItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBoardItem(ctx.db, input.id);
      return { ok: true as const };
    }),
});
