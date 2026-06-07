import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';

type AddUrlModalProps = {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
};

export default function AddUrlModal({
  open,
  isPending,
  onClose,
  onSubmit,
}: AddUrlModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setValue('');
    onClose();
  }

  useHotkey('Escape', close, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  useEffect(() => {
    if (open) {
      // Defer one tick so the input is mounted before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = value.trim();
    if (!url || isPending) return;
    onSubmit(url);
    close();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-32 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.15 }}
          onClick={close}
        >
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-label="Add URL"
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-raised ring-border/60 flex w-full max-w-[560px] items-center gap-2 rounded-xl px-4 py-3 shadow-2xl ring-1"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.98,
              y: 4,
              transition: { duration: 0.08, ease: 'easeOut' },
            }}
            transition={{ type: 'spring', ...spring.panel }}
          >
            <input
              ref={inputRef}
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste product URL…"
              disabled={isPending}
              className="text-fg placeholder:text-fg-subtle flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!value.trim() || isPending}
              className="bg-fg text-surface flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
            >
              {isPending ? (
                <span className="border-surface block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6h8M6 2l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
