import { z } from 'zod';
import {
  AddItemBody,
  BoardItemSchema,
  CreateBoardBody,
  PatchBoardItemBody,
  RenameBoardBody,
} from '../schemas/board';
import {
  addBoardItem,
  deleteBoardItem,
  emptyBoardTrash,
  listBoardItems,
  listTrashedBoardItems,
  patchBoardItem,
  purgeBoardItem,
  restoreBoardItem,
} from '../services/boardItems';
import {
  createBoard,
  deleteBoard,
  listBoards,
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
    .query(async ({ ctx, input }) =>
      z
        .array(BoardItemSchema)
        .parse(await listBoardItems(ctx.db, input.boardId)),
    ),

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

  listTrash: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) =>
      z
        .array(BoardItemSchema)
        .parse(await listTrashedBoardItems(ctx.db, input.boardId)),
    ),

  restoreItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await restoreBoardItem(ctx.db, input.id);
      return { ok: true as const };
    }),

  purgeItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await purgeBoardItem(ctx.db, ctx.images, input.id);
      return { ok: true as const };
    }),

  emptyTrash: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await emptyBoardTrash(ctx.db, ctx.images, input.boardId);
      return { ok: true as const };
    }),
});
