import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const pendingAutofillSubmit = useRef(false);

  function close() {
    pendingAutofillSubmit.current = false;
    setValue('');
    onClose();
  }

  function submitFrom(raw: string) {
    const url = raw.trim();
    if (!url || isPending) {
      // Empty on Enter is usually the browser committing autofill, not a
      // real submit. Flag it so the following onChange can finish the add.
      if (!url) {
        pendingAutofillSubmit.current = true;
      }
      return;
    }
    pendingAutofillSubmit.current = false;
    onSubmit(url);
    close();
  }

  function handleChange(next: string) {
    setValue(next);
    if (pendingAutofillSubmit.current && next.trim()) {
      submitFrom(next);
    }
  }

  useHotkey('Escape', close, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  useHotkey(
    'Enter',
    () => submitFrom(inputRef.current?.value ?? value),
    {
      scope: 'modal',
      enabled: open,
      allowInInputs: true,
    },
  );

  useLayoutEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

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
            onSubmit={(e) => {
              e.preventDefault();
              submitFrom(inputRef.current?.value ?? value);
            }}
            onClick={(e) => e.stopPropagation()}
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
              onChange={handleChange}
              isPending={isPending}
              inputRef={inputRef}
              onEnter={submitFrom}
            />
            <BookmarkletLink />
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
