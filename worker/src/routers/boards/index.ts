import { z } from 'zod';
import { ServiceCtx, withTransaction } from '../../db/tx';
import {
  AddItemBody,
  CreateBoardBody,
  DeleteItemsManyBody,
  PatchBoardItemBody,
  PatchItemsManyBody,
  RenameBoardBody,
} from '../../schemas/board';
import {
  addBoardItem,
  deleteBoardItem,
  deleteBoardItems,
  emptyBoardTrash,
  listBoardItems,
  listTrashedBoardItems,
  patchBoardItem,
  patchBoardItems,
  purgeBoardItem,
  reparseItem,
  restoreBoardItem,
  setPrimaryImage,
} from '../../services/boardItems';
import {
  acceptInvite,
  createInvite,
  leaveBoard,
  listMembers,
  removeMember,
} from '../../services/boardMembers';
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

  patchItemsMany: protectedProcedure
    .input(PatchItemsManyBody)
    .mutation(async ({ ctx, input }) => {
      await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => patchBoardItems(tx, input.patches),
      );
      return { ok: true as const };
    }),

  deleteItemsMany: protectedProcedure
    .input(DeleteItemsManyBody)
    .mutation(async ({ ctx, input }) => {
      await withTransaction(
        ctx.db,
        ctx.images,
        { userId: ctx.userId },
        async (tx) => deleteBoardItems(tx, input.ids),
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

  // Re-fetch the placement's sourceUrl and refresh its metadata + images.
  // Editor-allowed: any member can refresh any placement on a board they
  // belong to.
  reparseItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        reparseItem(tx, input.id, ctx.anthropicKey),
      ),
    ),

  // Pick which image is shown first / used as the placement's hero.
  setPrimaryImage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        imageId: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        setPrimaryImage(tx, input.id, input.imageId),
      ),
    ),

  // ---------- collab: invites + membership ----------

  invite: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        createInvite(tx, input.boardId),
      ),
    ),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        acceptInvite(tx, input.token),
      ),
    ),

  listMembers: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(async ({ ctx, input }) => {
      const svcCtx = new ServiceCtx(ctx.db, ctx.images, {
        userId: ctx.userId,
      });
      // Service performs its own owner-only check (via boards.requireOwner
      // resolved through the byIdOrThrow path). For now we re-derive role
      // here and 403 explicit editors so the response is precise.
      await svcCtx.boards.requireOwner(input.boardId);
      return listMembers(svcCtx, input.boardId);
    }),

  removeMember: protectedProcedure
    .input(z.object({ boardId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        removeMember(tx, input.boardId, input.userId),
      );
      return { ok: true as const };
    }),

  leave: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, (tx) =>
        leaveBoard(tx, input.boardId),
      );
      return { ok: true as const };
    }),
});
