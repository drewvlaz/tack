import { useCallback, useEffect, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { useBoards } from '../hooks/useBoards'
import { useCreateBoard } from '../hooks/useCreateBoard'
import { useDeleteBoard } from '../hooks/useDeleteBoard'
import { useRenameBoard } from '../hooks/useRenameBoard'
import { useBoardsStore } from '../store/boards'
import { useRailsStore } from '../store/rails'
import ConfirmDialog from './ConfirmDialog'
import Rail from './Rail'

const PENDING_PREFIX = '__pending__'

export default function BoardsSidebar() {
  const { boards } = useBoards()
  const createBoard = useCreateBoard()
  const deleteBoard = useDeleteBoard()
  const renameBoard = useRenameBoard()
  const activeBoardId = useBoardsStore((s) => s.activeBoardId)
  const setActiveBoardId = useBoardsStore((s) => s.setActiveBoardId)
  const leftWidth = useRailsStore((s) => s.leftWidth)
  const setLeftWidth = useRailsStore((s) => s.setLeftWidth)

  const [draftName, setDraftName] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; draft: string; original: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const renameInputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  // Reconcile active id when boards load or change.
  useEffect(() => {
    if (boards.length === 0) {
      if (activeBoardId !== null) setActiveBoardId(null)
      return
    }
    if (!activeBoardId || !boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(boards[0].id)
    }
  }, [boards, activeBoardId, setActiveBoardId])

  useEffect(() => {
    if (draftName !== null) inputRef.current?.focus()
  }, [draftName])

  function commitDraft() {
    const name = draftName?.trim()
    setDraftName(null)
    if (name) createBoard.mutate(name)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    deleteBoard.mutate(pendingDelete.id, {
      onSuccess: () => setPendingDelete(null),
    })
  }

  function commitRename() {
    if (!renaming) return
    const next = renaming.draft.trim()
    if (next && next !== renaming.original) {
      renameBoard.mutate({ id: renaming.id, name: next })
    }
    setRenaming(null)
  }

  return (
    <Rail side="left" width={leftWidth} onResize={setLeftWidth}>
      <header className="flex shrink-0 items-center justify-between px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">
          Tack
        </p>
        <button
          onClick={() => setDraftName('')}
          aria-label="New board"
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted ring-1 ring-border/60 hover:text-fg hover:ring-border transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 1v9M1 5.5h9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {draftName !== null && (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft()
              else if (e.key === 'Escape') setDraftName(null)
            }}
            onBlur={commitDraft}
            placeholder="New board name…"
            className="mb-1 w-full rounded-md bg-surface-muted px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none ring-1 ring-border/60 focus:ring-border"
          />
        )}

        {boards.length === 0 && draftName === null && (
          <p className="px-3 py-6 text-center text-xs text-fg-subtle">
            No boards yet — click + to create one.
          </p>
        )}

        {boards.map((board) => {
          const isActive = board.id === activeBoardId
          const isPending = board.id.startsWith(PENDING_PREFIX)
          const isRenaming = renaming?.id === board.id
          return (
            <div
              key={board.id}
              className={`group flex items-center rounded-md transition-colors ${
                isActive
                  ? 'bg-surface-muted text-fg'
                  : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg'
              }`}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renaming.draft}
                  onChange={(e) =>
                    setRenaming({ ...renaming, draft: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    else if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={commitRename}
                  className="flex-1 truncate bg-transparent px-3 py-2 text-sm text-fg outline-none"
                />
              ) : (
                <button
                  onClick={() => !isPending && setActiveBoardId(board.id)}
                  onDoubleClick={() => {
                    if (isPending) return
                    setRenaming({ id: board.id, draft: board.name, original: board.name })
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
                  <button
                    onClick={() =>
                      setRenaming({ id: board.id, draft: board.name, original: board.name })
                    }
                    aria-label={`Rename ${board.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 transition-opacity"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {boards.length > 1 && (
                    <button
                      onClick={() => setPendingDelete({ id: board.id, name: board.name })}
                      aria-label={`Delete ${board.name}`}
                      className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 2l6 6M8 2l-6 6"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

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
    </Rail>
  )
}
