import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';
import BookmarkletLink from '../Import/BookmarkletLink';
import UrlInputRow from '../shared/UrlInputRow';

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

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read from the DOM, not React state — paste + Enter in the same
    // tick leaves `value` stale, and a disabled submit button would also
    // make Chromium swallow that first Enter entirely.
    const url = (inputRef.current?.value ?? value).trim();
    if (!url || isPending) {
      return;
    }
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
            noValidate
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            className="bg-surface-raised ring-border/60 flex w-full max-w-[560px] flex-col gap-3 rounded-xl px-4 py-3 shadow-2xl ring-1"
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
            <UrlInputRow
              value={value}
              onChange={setValue}
              isPending={isPending}
              inputRef={inputRef}
            />
            <BookmarkletLink />
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
