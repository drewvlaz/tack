import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useToastsStore, type Toast, type ToastKind } from '../store/toasts';

function kindClass(kind: ToastKind): string {
  if (kind === 'error') {
    return 'text-red-600 dark:text-red-400';
  }
  if (kind === 'success') {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-fg';
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastsStore((s) => s.dismiss);

  useEffect(() => {
    if (toast.duration === 0) {
      return;
    }
    const t = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <motion.button
      layout
      type="button"
      onClick={() => dismiss(toast.id)}
      role="alert"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: 8,
        scale: 0.98,
        transition: { duration: 0.12, ease: 'easeOut' },
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`bg-surface-raised ring-border pointer-events-auto max-w-[34rem] cursor-pointer rounded-md px-3 py-1.5 text-xs shadow-lg ring-1 ${kindClass(
        toast.kind,
      )}`}
    >
      {toast.message}
    </motion.button>
  );
}

export default function Toaster() {
  const toasts = useToastsStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
