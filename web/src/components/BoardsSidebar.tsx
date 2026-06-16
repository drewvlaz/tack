import { format, formatDistanceToNow } from 'date-fns';
import { LogOut, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBoards } from '../hooks/server/useBoards';
import { useCreateBoard } from '../hooks/server/useCreateBoard';
import { useDeleteBoard } from '../hooks/server/useDeleteBoard';
import { useLeaveBoard } from '../hooks/server/useLeaveBoard';
import { useLogout } from '../hooks/server/useLogout';
import { useMe } from '../hooks/server/useMe';
import { useRenameBoard } from '../hooks/server/useRenameBoard';
import type { Board } from '../lib/trpc';
import { useBoardsStore } from '../store/boards';
import { useRailsStore } from '../store/rails';
import ConfirmDialog from './shared/ConfirmDialog';
import IconButton from './shared/IconButton';
import Rail from './shared/Rail';

const PENDING_PREFIX = '__pending__';

export default function BoardsSidebar() {
  const { boards, isLoading: boardsLoading } = useBoards();
  const { data: me } = useMe();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const renameBoard = useRenameBoard();
  const leaveBoard = useLeaveBoard();
  const logout = useLogout();

  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const setActiveBoardId = useBoardsStore((s) => s.setActiveBoardId);

  const leftWidth = useRailsStore((s) => s.leftWidth);
  const setLeftWidth = useRailsStore((s) => s.setLeftWidth);

  const [draftName, setDraftName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    id: string;
    draft: string;
    original: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const renameInputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  // Reconcile active id once boards have loaded.
  useEffect(() => {
    if (boardsLoading) {
      return;
    }
    if (boards.length === 0) {
      if (activeBoardId !== null) {
        setActiveBoardId(null);
      }
      return;
    }
    if (!activeBoardId || !boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(boards[0].id);
    }
  }, [boardsLoading, boards, activeBoardId, setActiveBoardId]);

  useEffect(() => {
    if (draftName !== null) {
      inputRef.current?.focus();
    }
  }, [draftName]);

  function commitDraft() {
    const name = draftName?.trim();
    setDraftName(null);
    if (name) {
      createBoard.mutate(name);
    }
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    deleteBoard.mutate(pendingDelete.id, {
      onSuccess: () => setPendingDelete(null),
    });
  }

  function confirmLeave() {
    if (!pendingLeave) {
      return;
    }
    leaveBoard.mutate(pendingLeave.id, {
      onSuccess: () => setPendingLeave(null),
    });
  }

  const ownedBoards = boards.filter((b) => b.role === 'owner');
  const sharedBoards = boards.filter((b) => b.role === 'editor');

  function commitRename() {
    if (!renaming) {
      return;
    }
    const next = renaming.draft.trim();
    if (next && next !== renaming.original) {
      renameBoard.mutate({ id: renaming.id, name: next });
    }
    setRenaming(null);
  }

  return (
    <Rail side="left" width={leftWidth} onResize={setLeftWidth}>
      <header className="flex shrink-0 items-center justify-between px-5 py-4">
        <p className="text-fg-subtle text-[11px] font-medium tracking-[0.18em] uppercase">
          Tack
        </p>
        <IconButton
          size="sm"
          onClick={() => setDraftName('')}
          aria-label="New board"
          className="ring-border/60 hover:ring-border ring-1"
        >
          <Plus size={12} strokeWidth={1.75} aria-hidden />
        </IconButton>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {draftName !== null && (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
              } else if (e.key === 'Escape') {
                setDraftName(null);
              }
            }}
            onBlur={commitDraft}
            placeholder="New board name…"
            className="bg-surface-muted text-fg placeholder:text-fg-subtle ring-border/60 focus:ring-border mb-1 w-full rounded-md px-3 py-2 text-sm ring-1 outline-none"
          />
        )}

        {boards.length === 0 && draftName === null && (
          <p className="text-fg-subtle px-3 py-6 text-center text-xs">
            No boards yet — click + to create one.
          </p>
        )}

        {ownedBoards.length > 0 && (
          <BoardGroup
            label="Your boards"
            boards={ownedBoards}
            activeBoardId={activeBoardId}
            renaming={renaming}
            renameInputRef={renameInputRef}
            onSetActive={setActiveBoardId}
            onRenameStart={(b) =>
              setRenaming({ id: b.id, draft: b.name, original: b.name })
            }
            onRenameChange={(draft) =>
              renaming && setRenaming({ ...renaming, draft })
            }
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenaming(null)}
            onDelete={(b) => setPendingDelete({ id: b.id, name: b.name })}
            canDelete={ownedBoards.length + sharedBoards.length > 1}
          />
        )}

        {sharedBoards.length > 0 && (
          <BoardGroup
            label="Shared with you"
            boards={sharedBoards}
            activeBoardId={activeBoardId}
            renaming={renaming}
            renameInputRef={renameInputRef}
            onSetActive={setActiveBoardId}
            onRenameStart={null}
            onRenameChange={() => undefined}
            onRenameCommit={() => undefined}
            onRenameCancel={() => undefined}
            onLeave={(b) => setPendingLeave({ id: b.id, name: b.name })}
            canDelete={false}
          />
        )}
      </div>

      {me && (
        <footer className="border-border/60 flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3">
          <span className="text-fg-muted truncate text-xs" title={me.email}>
            {me.email}
          </span>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="text-fg-subtle hover:text-fg text-[11px] uppercase tracking-wider disabled:opacity-50"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </footer>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete board?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” and everything on it will be permanently deleted.`
            : undefined
        }
        confirmLabel={deleteBoard.isPending ? 'Deleting…' : 'Delete'}
        destructive
        busy={deleteBoard.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={pendingLeave !== null}
        title="Leave board?"
        message={
          pendingLeave
            ? `You'll lose access to “${pendingLeave.name}”. The owner can re-invite you later.`
            : undefined
        }
        confirmLabel={leaveBoard.isPending ? 'Leaving…' : 'Leave'}
        destructive
        busy={leaveBoard.isPending}
        onCancel={() => setPendingLeave(null)}
        onConfirm={confirmLeave}
      />
    </Rail>
  );
}

type BoardGroupProps = {
  label: string;
  boards: Board[];
  activeBoardId: string | null;
  renaming: { id: string; draft: string; original: string } | null;
  renameInputRef: (el: HTMLInputElement | null) => void;
  onSetActive: (id: string) => void;
  // Rename is gated to owners by passing `null` from the shared-group caller.
  onRenameStart: ((board: Board) => void) | null;
  onRenameChange: (draft: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDelete?: (board: Board) => void;
  onLeave?: (board: Board) => void;
  canDelete: boolean;
};

function BoardGroup({
  label,
  boards,
  activeBoardId,
  renaming,
  renameInputRef,
  onSetActive,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onLeave,
  canDelete,
}: BoardGroupProps) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-fg-subtle px-3 pt-2 pb-1 text-[10px] font-medium tracking-[0.18em] uppercase">
        {label}
      </p>
      {boards.map((board) => {
        const isActive = board.id === activeBoardId;
        const isPending = board.id.startsWith(PENDING_PREFIX);
        const isRenaming = renaming?.id === board.id;
        return (
          <div
            key={board.id}
            className={`group flex items-center rounded-md transition-colors ${
              isActive
                ? 'bg-surface-muted text-fg'
                : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg'
            }`}
          >
            {isRenaming && renaming ? (
              <input
                ref={renameInputRef}
                value={renaming.draft}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRenameCommit();
                  } else if (e.key === 'Escape') {
                    onRenameCancel();
                  }
                }}
                onBlur={onRenameCommit}
                className="text-fg flex-1 truncate bg-transparent px-3 py-2 text-sm outline-none"
              />
            ) : (
              <button
                onClick={() => !isPending && onSetActive(board.id)}
                onDoubleClick={() => {
                  if (isPending || !onRenameStart) {
                    return;
                  }
                  onRenameStart(board);
                }}
                disabled={isPending}
                title={
                  isPending
                    ? undefined
                    : `Created ${formatDistanceToNow(new Date(board.createdAt * 1000), { addSuffix: true })} · ${format(new Date(board.createdAt * 1000), 'PP')}`
                }
                className="flex-1 truncate px-3 py-2 text-left text-sm disabled:opacity-50"
              >
                {board.name}
              </button>
            )}
            {!isPending && !isRenaming && (
              <>
                {onRenameStart && (
                  <button
                    onClick={() => onRenameStart(board)}
                    aria-label={`Rename ${board.name}`}
                    className="text-fg-subtle hover:text-fg flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Pencil size={11} strokeWidth={1.6} aria-hidden />
                  </button>
                )}
                {onDelete && canDelete && (
                  <button
                    onClick={() => onDelete(board)}
                    aria-label={`Delete ${board.name}`}
                    className="text-fg-subtle hover:text-fg mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={12} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
                {onLeave && (
                  <button
                    onClick={() => onLeave(board)}
                    aria-label={`Leave ${board.name}`}
                    title="Leave board"
                    className="text-fg-subtle hover:text-fg mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <LogOut size={11} strokeWidth={1.6} aria-hidden />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
