import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { spring } from '../config';
import { useEmptyTrash } from '../hooks/server/useEmptyTrash';
import { usePurgeItem } from '../hooks/server/usePurgeItem';
import { useRestoreItem } from '../hooks/server/useRestoreItem';
import { useTrashItems } from '../hooks/server/useTrashItems';
import { useHotkey } from '../hooks/useHotkey';
import { resolveImageUrl } from '../lib/api';
import type { BoardItem } from '../lib/trpc';
import ConfirmDialog from './shared/ConfirmDialog';

type TrashDrawerProps = {
  open: boolean;
  boardId: string;
  onClose: () => void;
};

export default function TrashDrawer({
  open,
  boardId,
  onClose,
}: TrashDrawerProps) {
  const { items, isLoading } = useTrashItems(boardId, open);
  const restore = useRestoreItem(boardId);
  const purge = usePurgeItem(boardId);
  const emptyTrash = useEmptyTrash(boardId);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useHotkey('Escape', onClose, {
    scope: 'modal',
    enabled: open && !confirmEmpty,
  });

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Trash"
              className="bg-surface-raised ring-border/60 flex max-h-[80vh] w-[640px] flex-col overflow-hidden rounded-xl shadow-2xl ring-1"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', ...spring.panel }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-border/60 flex shrink-0 items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="text-fg text-sm font-medium">Trash</h2>
                  <p className="text-fg-subtle mt-0.5 text-xs">
                    Removed items on this board. Restore them or delete forever.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close trash"
                  className="text-fg-subtle hover:text-fg flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 2l6 6M8 2l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {isLoading ? (
                  <p className="text-fg-subtle py-8 text-center text-xs">
                    Loading…
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-fg-subtle py-12 text-center text-xs">
                    Trash is empty.
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 gap-3">
                    {items.map((item) => (
                      <TrashRow
                        key={item.id}
                        item={item}
                        onRestore={() => restore.mutate(item.id)}
                        onPurge={() => purge.mutate(item.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {items.length > 0 && (
                <footer className="border-border/60 flex shrink-0 items-center justify-between border-t px-5 py-3">
                  <span className="text-fg-subtle text-xs">
                    {items.length} item{items.length === 1 ? '' : 's'}
                  </span>
                  <button
                    onClick={() => setConfirmEmpty(true)}
                    className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/15 dark:text-red-400"
                  >
                    Empty trash
                  </button>
                </footer>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmEmpty}
        title="Empty trash?"
        message={`${items.length} item${items.length === 1 ? '' : 's'} will be permanently deleted along with any unreferenced images.`}
        confirmLabel={emptyTrash.isPending ? 'Deleting…' : 'Empty trash'}
        destructive
        busy={emptyTrash.isPending}
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() =>
          emptyTrash.mutate(undefined, {
            onSuccess: () => setConfirmEmpty(false),
          })
        }
      />
    </>
  );
}

type TrashRowProps = {
  item: BoardItem;
  onRestore: () => void;
  onPurge: () => void;
};

function TrashRow({ item, onRestore, onPurge }: TrashRowProps) {
  const imageUrl = resolveImageUrl(item.images[0]?.url);
  return (
    <li className="bg-surface-muted ring-border/60 group flex gap-3 overflow-hidden rounded-lg p-2 ring-1">
      <div className="bg-surface ring-border/60 h-16 w-16 shrink-0 overflow-hidden rounded-md ring-1">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={item.title ?? ''}
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-fg truncate text-xs font-medium">
          {item.title ?? 'Untitled'}
        </p>
        {item.brand && (
          <p className="text-fg-subtle truncate text-[11px]">{item.brand}</p>
        )}
        <div className="mt-auto flex gap-1.5 pt-1.5">
          <button
            onClick={onRestore}
            className="text-fg-muted hover:text-fg hover:bg-surface/60 rounded px-2 py-1 text-[11px] transition-colors"
          >
            Restore
          </button>
          <button
            onClick={onPurge}
            className="rounded px-2 py-1 text-[11px] text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            Delete forever
          </button>
        </div>
      </div>
    </li>
  );
}
