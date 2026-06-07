import { z } from 'zod';
import {
  AddItemBody,
  CreateBoardBody,
  PatchBoardItemBody,
  RenameBoardBody,
} from '../schemas/board';
import {
  addBoardItem,
  createBoard,
  deleteBoard,
  deleteBoardItem,
  listBoardItems,
  listBoards,
  patchBoardItem,
  renameBoard,
} from '../services/boards';
import { publicProcedure, router } from '../trpc/init';

export const boardsRouter = router({
  list: publicProcedure.query(({ ctx }) => listBoards(ctx.db)),

  create: publicProcedure
    .input(CreateBoardBody)
    .mutation(({ ctx, input }) => createBoard(ctx.db, input.name)),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBoard(ctx.db, input.id);
      return { ok: true as const };
    }),

  rename: publicProcedure
    .input(RenameBoardBody)
    .mutation(({ ctx, input }) => renameBoard(ctx.db, input.id, input.name)),

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
