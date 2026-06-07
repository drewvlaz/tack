import { motion, type MotionStyle } from 'framer-motion';

type PulseProps = {
  className?: string;
  style?: MotionStyle;
};

export default function Pulse({ className = '', style }: PulseProps) {
  return (
    <motion.div
      className={`bg-surface-muted ${className}`}
      style={style}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
