import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';

type ImageLightboxProps = {
  open: boolean;
  src: string | null;
  alt?: string;
  onClose: () => void;
};

export default function ImageLightbox({
  open,
  src,
  alt,
  onClose,
}: ImageLightboxProps) {
  useHotkey('Escape', onClose, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.img
            src={src}
            alt={alt ?? ''}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', ...spring.panel }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
