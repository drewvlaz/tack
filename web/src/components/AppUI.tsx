import { AnimatePresence } from 'framer-motion';
import { Lock, Moon, Share2, Sun, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBoardItems } from '../hooks/server/useBoardItems';
import { useBoardRole, useBoards } from '../hooks/server/useBoards';
import { useDeleteItems } from '../hooks/server/useDeleteItems';
import { useSelectionHotkeys } from '../hooks/useSelectionHotkeys';
import { MESSAGES } from '../lib/messages';
import { can, P } from '../lib/permissions';
import type { RealItem } from '../lib/trpc';
import { useBoardsStore } from '../store/boards';
import { useSelectionStore } from '../store/selection';
import { useThemeStore } from '../store/theme';
import BoardsSidebar from './BoardsSidebar';
import MembersPanel from './BoardSettings/MembersPanel';
import ConfirmDialog from './shared/ConfirmDialog';
import IconButton from './shared/IconButton';
import SidePanel from './SidePanel/SidePanel';
import TrashDrawer from './TrashDrawer';

export default function AppUI() {
  const selectionIds = useSelectionStore((s) => s.ids);
  const primaryId = useSelectionStore((s) => s.primaryId);
  const { isDark, toggle } = useThemeStore();
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items } = useBoardItems(activeBoardId);
  const realItems = useMemo(
    () => items.filter((i): i is RealItem => i.state === 'real'),
    [items],
  );
  const primaryItem = activeBoardId && primaryId
    ? realItems.find((i) => i.id === primaryId) ?? null
    : null;
  // SidePanel currently only renders product items. Text items get their own
  // detail UI in a later card.
  const primaryProductItem =
    primaryItem && primaryItem.kind === 'product' ? primaryItem : null;

  const deleteItems = useDeleteItems(activeBoardId ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const { boards } = useBoards();
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const role = useBoardRole(activeBoardId);
  const canManage = can(role, P.BoardManage);
  const canEdit = can(role, P.BoardEdit);

  const selectionCount = selectionIds.size;
  const isMulti = selectionCount > 1;
  const isPending = deleteItems.isPending;

  const realItemIds = useMemo(() => realItems.map((i) => i.id), [realItems]);
  useSelectionHotkeys({
    selectionCount,
    activeBoardId,
    realItemIds,
    canEdit,
    onDeleteRequest: () => setConfirmDeleteOpen(true),
  });

  function handleConfirmDelete() {
    if (selectionCount === 0) {
      return;
    }
    deleteItems.mutate([...selectionIds], {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        useSelectionStore.getState().clear();
      },
    });
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <BoardsSidebar />

      <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-2">
        {activeBoardId && role && role !== 'owner' && (
          <span
            className="bg-surface-raised ring-border text-fg-muted flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium tracking-wider uppercase shadow-md ring-1"
            title={role === 'viewer' ? MESSAGES.BOARD_READ_ONLY : MESSAGES.BOARD_EDIT_ONLY}
          >
            <Lock size={10} strokeWidth={2} aria-hidden />
            {role}
          </span>
        )}
        {activeBoardId && canManage && (
          <IconButton
            variant="raised"
            onClick={() => setMembersOpen(true)}
            aria-label="Share board"
            title="Share"
          >
            <Share2 size={13} strokeWidth={1.6} aria-hidden />
          </IconButton>
        )}
        {activeBoardId && !canManage && role && (
          <IconButton
            variant="raised"
            onClick={() => setMembersOpen(true)}
            aria-label="See people with access"
            title="People with access"
          >
            <Users size={13} strokeWidth={1.6} aria-hidden />
          </IconButton>
        )}
        {activeBoardId && (
          <IconButton
            variant="raised"
            onClick={() => setTrashOpen(true)}
            aria-label="Open trash"
            title="Trash"
          >
            <Trash2 size={13} strokeWidth={1.6} aria-hidden />
          </IconButton>
        )}
        <IconButton variant="raised" onClick={toggle} aria-label="Toggle dark mode">
          {isDark ? (
            <Sun size={14} strokeWidth={1.6} aria-hidden />
          ) : (
            <Moon size={14} strokeWidth={1.6} aria-hidden />
          )}
        </IconButton>
      </div>

      {isMulti && (
        <div
          className="bg-surface-raised ring-border text-fg pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md ring-1"
          role="status"
        >
          {selectionCount} selected
        </div>
      )}

      {/* aria-live region — announces selection count changes. Polite, so a
          screen reader finishes the current utterance before reading. */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectionCount === 0
          ? ''
          : selectionCount === 1
            ? '1 item selected'
            : `${selectionCount} items selected`}
      </div>

      <AnimatePresence>
        {primaryProductItem && activeBoardId && (
          <SidePanel
            key={primaryProductItem.id}
            item={primaryProductItem}
            boardId={activeBoardId}
            onClose={() => useSelectionStore.getState().clear()}
          />
        )}
      </AnimatePresence>

      {activeBoardId && (
        <TrashDrawer
          open={trashOpen}
          boardId={activeBoardId}
          onClose={() => setTrashOpen(false)}
        />
      )}

      {activeBoardId && activeBoard && role && (
        <MembersPanel
          open={membersOpen}
          boardId={activeBoardId}
          boardName={activeBoard.name}
          onClose={() => setMembersOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={isMulti ? 'Remove items from board?' : 'Remove from board?'}
        message={
          isMulti
            ? `${selectionCount} items will be removed from this board.`
            : primaryProductItem?.title
              ? `“${primaryProductItem.title}” will be removed from this board.`
              : 'This item will be removed from this board.'
        }
        confirmLabel={isPending ? 'Removing…' : 'Remove'}
        destructive
        busy={isPending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
