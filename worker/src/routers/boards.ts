import { z } from 'zod';
import { imageDisplayUrl } from '../lib/imageRoute';
import {
  AddItemBody,
  BoardItemSchema,
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
    .query(async ({ ctx, input }) => {
      const rows = await listBoardItems(ctx.db, input.boardId);
      return z.array(BoardItemSchema).parse(rows.map(toBoardItemWire));
    }),

  patchItem: publicProcedure
    .input(z.object({ id: z.string(), patch: PatchBoardItemBody }))
    .mutation(async ({ ctx, input }) => {
      await patchBoardItem(ctx.db, input.id, input.patch);
      return { ok: true as const };
    }),

  addItem: publicProcedure
    .input(z.object({ boardId: z.string(), item: AddItemBody }))
    .mutation(async ({ ctx, input }) => {
      const row = await addBoardItem(ctx.db, input.boardId, input.item);
      return BoardItemSchema.parse(toBoardItemWire(row));
    }),

  deleteItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBoardItem(ctx.db, input.id);
      return { ok: true as const };
    }),

  listTrash: publicProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listTrashedBoardItems(ctx.db, input.boardId);
      return z.array(BoardItemSchema).parse(rows.map(toBoardItemWire));
    }),

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
