import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';
import UrlInputRow from '../shared/UrlInputRow';

type AddUrlModalProps = {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  errorMessage: string | null;
  onClearError: () => void;
};

export default function AddUrlModal({
  open,
  isPending,
  onClose,
  onSubmit,
  errorMessage,
  onClearError,
}: AddUrlModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setValue('');
    onClose();
  }

  function handleChange(v: string) {
    if (errorMessage) onClearError();
    setValue(v);
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
    // Leave the modal open if the mutation might fail; close only on success.
    // We can't await mutate() here without changing the contract, so the
    // existing close-on-submit is preserved for now and the error surfaces
    // in UrlBar instead.
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            className="bg-surface-raised ring-border/60 flex w-full max-w-[560px] flex-col gap-2 rounded-xl px-4 py-3 shadow-2xl ring-1"
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
            <div className="flex items-center gap-2">
              <UrlInputRow
                value={value}
                onChange={handleChange}
                isPending={isPending}
                inputRef={inputRef}
              />
            </div>
            {errorMessage && (
              <p
                role="alert"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {errorMessage}
              </p>
            )}
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
