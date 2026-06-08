import { z } from 'zod';
import { withTransaction } from '../db/tx';
import { imageDisplayUrl } from '../lib/imageRoute';
import {
  AddItemBody,
  CreateBoardBody,
  PatchBoardItemBody,
  RenameBoardBody,
  type BoardItem,
  type BoardItemRow,
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

// Domain → wire. Resolves each StoredImage ref to a `/api/images/...` URL
// (or external URL) the frontend can fetch directly. This is the ONE place
// transport URLs are constructed from service output.
function toBoardItemWire(row: BoardItemRow): BoardItem {
  return {
    ...row,
    images: row.images.map(({ id, image }) => ({
      id,
      url: imageDisplayUrl(image),
    })),
  };
}

export const boardsRouter = router({
  list: publicProcedure.query(({ ctx }) => listBoards(ctx.db)),

  create: publicProcedure
    .input(CreateBoardBody)
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, async (tx) =>
        createBoard(tx, input.name),
      ),
    ),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, (tx) =>
        deleteBoard(tx, input.id),
      );
      return { ok: true as const };
    }),

  rename: publicProcedure
    .input(RenameBoardBody)
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, (tx) =>
        renameBoard(tx, input.id, input.name),
      ),
    ),

  getItems: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listBoardItems(ctx.db, input.boardId);
      return rows.map(toBoardItemWire);
    }),

  patchItem: publicProcedure
    .input(z.object({ id: z.string(), patch: PatchBoardItemBody }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, async (tx) =>
        patchBoardItem(tx, input.id, input.patch),
      );
      return { ok: true as const };
    }),

  addItem: publicProcedure
    .input(z.object({ boardId: z.string(), item: AddItemBody }))
    .mutation(async ({ ctx, input }) => {
      const row = await withTransaction(ctx.db, ctx.images, async (tx) =>
        addBoardItem(tx, input.boardId, input.item),
      );
      return toBoardItemWire(row);
    }),

  deleteItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, async (tx) =>
        deleteBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  listTrash: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listTrashedBoardItems(ctx.db, input.boardId);
      return rows.map(toBoardItemWire);
    }),

  restoreItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, async (tx) =>
        restoreBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  purgeItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, (tx) =>
        purgeBoardItem(tx, input.id),
      );
      return { ok: true as const };
    }),

  emptyTrash: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, (tx) =>
        emptyBoardTrash(tx, input.boardId),
      );
      return { ok: true as const };
    }),
});
