import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { spring } from '../../config';
import { useBoardMembers } from '../../hooks/server/useBoardMembers';
import { useInviteToBoard } from '../../hooks/server/useInviteToBoard';
import { useRemoveMember } from '../../hooks/server/useRemoveMember';
import { useHotkey } from '../../hooks/useHotkey';
import { useToastsStore } from '../../store/toasts';
import Button from '../shared/Button';

// Owner-only sharing panel. Lists the active board's owner + editors, lets
// the owner generate a one-shot invite link and remove individual editors.
// Mounted from AppUI when the active board's `role === 'owner'`.
export default function MembersPanel({
  open,
  boardId,
  boardName,
  onClose,
}: {
  open: boolean;
  boardId: string;
  boardName: string;
  onClose: () => void;
}) {
  const { members, isLoading } = useBoardMembers(open ? boardId : null);
  const invite = useInviteToBoard();
  const removeMember = useRemoveMember(boardId);
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const showToast = useToastsStore((s) => s.show);

  useHotkey('Escape', onClose, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  async function generate() {
    try {
      const { token } = await invite.mutateAsync(boardId);
      // Build the share URL against the current origin so it works in dev
      // (5173) and prod alike. The server doesn't know our public URL.
      setLatestLink(`${window.location.origin}/i/${token}`);
    } catch (err) {
      showToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to create invite.',
      });
    }
  }

  async function copy() {
    if (!latestLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(latestLink);
      showToast({ kind: 'success', message: 'Invite link copied.' });
    } catch {
      showToast({
        kind: 'error',
        message: 'Copy failed — select the link manually.',
      });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Share ${boardName}`}
            className="bg-surface-raised ring-border/60 w-[420px] rounded-xl p-5 shadow-2xl ring-1"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', ...spring.panel }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-fg text-sm font-medium">Share board</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-fg-subtle hover:text-fg text-xs"
              >
                Close
              </button>
            </div>
            <p
              className="text-fg-muted mt-1 truncate text-xs"
              title={boardName}
            >
              {boardName}
            </p>

            <section className="mt-5">
              <p className="text-fg-subtle text-[11px] font-medium tracking-wider uppercase">
                Invite link
              </p>
              {latestLink ? (
                <div className="ring-border/60 bg-surface-muted mt-2 flex items-center gap-2 rounded-md p-2 ring-1">
                  <code className="text-fg flex-1 truncate text-[11px]">
                    {latestLink}
                  </code>
                  <Button size="sm" variant="secondary" onClick={copy}>
                    Copy
                  </Button>
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  loading={invite.isPending}
                  onClick={generate}
                >
                  {latestLink ? 'New link' : 'Generate link'}
                </Button>
                <span className="text-fg-subtle text-[11px]">
                  Single-use, expires in 7 days.
                </span>
              </div>
            </section>

            <section className="mt-6">
              <p className="text-fg-subtle text-[11px] font-medium tracking-wider uppercase">
                People with access
              </p>
              {isLoading ? (
                <p className="text-fg-subtle mt-2 text-xs">Loading…</p>
              ) : (
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                  {members.map((m) => (
                    <li
                      key={m.userId}
                      className="hover:bg-surface-muted/60 group flex items-center gap-3 rounded-md px-2 py-1.5"
                    >
                      <span className="text-fg flex-1 truncate text-xs">
                        {m.email}
                      </span>
                      <span className="text-fg-subtle text-[11px] uppercase tracking-wider">
                        {m.role}
                      </span>
                      {m.role === 'editor' && (
                        <button
                          onClick={() =>
                            removeMember.mutate(m.userId, {
                              onSuccess: () =>
                                showToast({
                                  kind: 'success',
                                  message: `Removed ${m.email}`,
                                }),
                              onError: (err) =>
                                showToast({
                                  kind: 'error',
                                  message:
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to remove member.',
                                }),
                            })
                          }
                          disabled={removeMember.isPending}
                          className="text-fg-subtle hover:text-fg text-[11px] opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
