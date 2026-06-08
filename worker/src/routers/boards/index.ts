import { z } from 'zod';
import { ServiceCtx, withTransaction } from '../../db/tx';
import {
  AddItemBody,
  CreateBoardBody,
  PatchBoardItemBody,
  RenameBoardBody,
} from '../../schemas/board';
import {
  addBoardItem,
  deleteBoardItem,
  emptyBoardTrash,
  listBoardItems,
  listTrashedBoardItems,
  patchBoardItem,
  purgeBoardItem,
  restoreBoardItem,
} from '../../services/boardItems';
import {
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
} from '../../services/boards';
import { protectedProcedure, router } from '../../trpc/init';
import { toBoardItemWire } from './wire';

export const boardsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listBoards(new ServiceCtx(ctx.db, ctx.images, { userId: ctx.userId })),
  ),

  create: protectedProcedure
    .input(CreateBoardBody)
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, async (tx) =>
        createBoard(tx, input.name),
      ),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        deleteBoard(tx, input.id),
      );
      return { ok: true as const };
    }),

  rename: protectedProcedure
    .input(RenameBoardBody)
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        renameBoard(tx, input.id, input.name),
      ),
    ),

  getItems: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listBoardItems(
        new ServiceCtx(ctx.db, ctx.images, { userId: ctx.userId }),
        input.boardId,
      );
      return rows.map(toBoardItemWire);
    }),

  patchItem: protectedProcedure
    .input(z.object({ id: z.string(), patch: PatchBoardItemBody }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => patchBoardItem(tx, input.id, input.patch),
      );
      return { ok: true as const };
    }),

  addItem: protectedProcedure
    .input(z.object({ boardId: z.string(), item: AddItemBody }))
    .mutation(async ({ ctx, input }) => {
      const row = await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => addBoardItem(tx, input.boardId, input.item),
      );
      return toBoardItemWire(row);
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => deleteBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  listTrash: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listTrashedBoardItems(
        new ServiceCtx(ctx.db, ctx.images, { userId: ctx.userId }),
        input.boardId,
      );
      return rows.map(toBoardItemWire);
    }),

  restoreItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => restoreBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  purgeItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        purgeBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  emptyTrash: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        emptyBoardTrash(tx, input.boardId),
      );
      return { ok: true as const };
    }),
});
