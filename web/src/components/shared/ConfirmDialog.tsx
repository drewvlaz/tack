import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useHotkey('Escape', onCancel, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });
  useHotkey('Enter', onConfirm, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="bg-surface-raised ring-border/60 w-[340px] rounded-xl p-5 shadow-2xl ring-1"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', ...spring.panel }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-fg text-sm font-medium">{title}</h3>
            {message && (
              <p className="text-fg-muted mt-1.5 text-xs leading-relaxed">
                {message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={busy}
                className="text-fg-muted hover:text-fg rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors disabled:opacity-50 ${
                  destructive
                    ? 'bg-red-500/10 text-red-600 ring-red-500/30 hover:bg-red-500/15 dark:text-red-400'
                    : 'bg-surface-muted text-fg ring-border/60 hover:bg-surface-muted/70'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
