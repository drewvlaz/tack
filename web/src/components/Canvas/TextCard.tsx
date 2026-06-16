import { motion } from 'framer-motion';

// Maps the persisted `textColorToken` to a Tailwind class backed by the
// design tokens in index.css. Add new tokens here when the picker exposes
// them — unknown / null falls back to `text-fg`.
const COLOR_TOKEN_CLASSES: Record<string, string> = {
  fg: 'text-fg',
  'fg-muted': 'text-fg-muted',
  'fg-subtle': 'text-fg-subtle',
};

const ALIGN_CLASSES: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;

type TextCardProps = {
  id: string;
  content: string;
  fontSize: number | null;
  fontWeight: number | null;
  colorToken: string | null;
  align: 'left' | 'center' | 'right' | null;
  x: number;
  y: number;
  zIndex?: number;
};

// View-only canvas text item. No images, no resize handles, no drag — size
// is content-driven (per TAC-3 scope). Selection / drag / edit modes wire in
// via later cards on top of this. Preserves user newlines via pre-wrap.
export default function TextCard({
  content,
  fontSize,
  fontWeight,
  colorToken,
  align,
  x,
  y,
  zIndex = 0,
}: TextCardProps) {
  const colorClass =
    (colorToken && COLOR_TOKEN_CLASSES[colorToken]) ?? 'text-fg';
  const alignClass = align ? ALIGN_CLASSES[align] : 'text-left';
  return (
    <motion.div
      style={{
        x,
        y,
        zIndex,
        fontSize: fontSize ?? DEFAULT_FONT_SIZE,
        fontWeight: fontWeight ?? DEFAULT_FONT_WEIGHT,
        whiteSpace: 'pre-wrap',
      }}
      className={`absolute leading-tight select-none ${colorClass} ${alignClass}`}
    >
      {content}
    </motion.div>
  );
}
