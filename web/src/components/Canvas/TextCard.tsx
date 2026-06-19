import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { forwardRef, useCallback, useRef, useState } from 'react';
import { spring } from '../../config';
import { useCardGesture } from '../../hooks/interaction/useCardGesture';
import { useCardResize } from '../../hooks/interaction/useCardResize';

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
const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 80;

type TextCardProps = {
  id: string;
  content: string;
  fontSize: number | null;
  fontWeight: number | null;
  colorToken: string | null;
  align: 'left' | 'center' | 'right' | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  zIndex?: number;
  canEdit?: boolean;
  isSelected?: boolean;
  onCommit?: (next: string) => void;
  onResizeEnd?: (next: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
  }) => void;
  onDragEnd?: (x: number, y: number) => void;
  onTap?: (mods: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }) => void;
  getZoom?: () => number;
  autoEditOnMount?: boolean;
};

// Canvas text item. View by default; double-click switches to a textarea
// for inline editing. Enter commits, Esc cancels, blur commits. Width is
// user-controlled via corner handles; text wraps within that width and
// height grows with content (textarea uses `field-sizing: content`; view
// div is just block-flow).
export default function TextCard({
  content,
  fontSize,
  fontWeight,
  colorToken,
  align,
  x: xProp,
  y: yProp,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  zIndex = 0,
  canEdit = false,
  isSelected = false,
  onCommit,
  onResizeEnd,
  onDragEnd,
  onTap,
  getZoom,
  autoEditOnMount = false,
}: TextCardProps) {
  const [editing, setEditing] = useState(() => canEdit && autoEditOnMount);
  const [draft, setDraft] = useState(content);
  const cancellingRef = useRef(false);
  const lastTapMods = useRef({
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
  });

  // useCardGesture owns x/y/springX/springY + the drag handler. Drag is
  // disabled while editing so clicks inside the textarea don't capture
  // pointer-down as drag start.
  const { ref, x, y, springX, springY } = useCardGesture({
    initialX: xProp,
    initialY: yProp,
    getZoom,
    onTap: onTap ? () => onTap(lastTapMods.current) : undefined,
    onDragEnd,
    dragEnabled: canEdit && !editing,
  });

  const w = useMotionValue(width);
  const h = useMotionValue(height);
  const springW = useSpring(w, spring.card);
  const springH = useSpring(h, spring.card);

  // Font scales with sqrt of box area so any drag direction (horizontal,
  // vertical, or diagonal) grows the text proportionally. The ratio is
  // baseFontSize / sqrt(baseW * baseH), held constant across resizes —
  // after commit the props update to the new size, and recomputing the
  // ratio yields the same number (invariant).
  const baseFontSize = fontSize ?? DEFAULT_FONT_SIZE;
  const baseArea = width * height;
  const fontSizeMV = useTransform(
    [springW, springH] as MotionValue<number>[],
    ([cw, ch]: number[]) =>
      baseFontSize * Math.sqrt((cw * ch) / baseArea),
  );

  const handleResizeEnd = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      const nextFontSize =
        baseFontSize * Math.sqrt((next.width * next.height) / baseArea);
      onResizeEnd?.({ ...next, fontSize: nextFontSize });
    },
    [baseFontSize, baseArea, onResizeEnd],
  );

  const { nwRef, neRef, swRef, seRef } = useCardResize({
    x,
    y,
    width: w,
    height: h,
    springX,
    springY,
    springWidth: springW,
    springHeight: springH,
    getZoom,
    onResizeEnd: onResizeEnd ? handleResizeEnd : undefined,
  });

  const enterEdit = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setDraft(content);
    setEditing(true);
  }, [canEdit, content]);

  const commit = useCallback(() => {
    if (cancellingRef.current) {
      cancellingRef.current = false;
      return;
    }
    setEditing(false);
    if (draft !== content) {
      onCommit?.(draft);
    }
  }, [draft, content, onCommit]);

  const cancel = useCallback(() => {
    cancellingRef.current = true;
    setDraft(content);
    setEditing(false);
  }, [content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  const colorClass =
    (colorToken && COLOR_TOKEN_CLASSES[colorToken]) ?? 'text-fg';
  const alignClass = align ? ALIGN_CLASSES[align] : 'text-left';

  const fontWeightValue = fontWeight ?? DEFAULT_FONT_WEIGHT;

  return (
    <motion.div
      ref={ref}
      onPointerDown={(e) => {
        lastTapMods.current = {
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
        };
      }}
      style={{
        x: springX,
        y: springY,
        width: springW,
        height: springH,
        zIndex,
        touchAction: 'none',
      }}
      className={`group absolute leading-tight ${colorClass} ${alignClass} ${
        canEdit && !editing ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isSelected ? 'ring-2 ring-fg/70 ring-offset-2 ring-offset-bg rounded-sm' : ''}`}
      onDoubleClick={enterEdit}
    >
      {editing ? (
        <motion.textarea
          autoFocus
          value={draft}
          placeholder="Type…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{
            fontSize: fontSizeMV,
            fontWeight: fontWeightValue,
            // Width comes from the outer box; field-sizing keeps the textarea
            // height tracking the wrapped content height.
            // fieldSizing isn't in React's CSSProperties types yet.
            ...({ fieldSizing: 'content' } as Record<string, string>),
            width: '100%',
            background: 'transparent',
            border: 0,
            outline: 'none',
            padding: 0,
            margin: 0,
            resize: 'none',
            color: 'inherit',
            font: 'inherit',
            lineHeight: 'inherit',
            textAlign: 'inherit' as const,
            whiteSpace: 'pre-wrap' as const,
            wordBreak: 'break-word' as const,
            overflowWrap: 'anywhere' as const,
            display: 'block',
          }}
        />
      ) : (
        <motion.div
          style={{
            fontSize: fontSizeMV,
            fontWeight: fontWeightValue,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
          className="select-none"
        >
          {content}
        </motion.div>
      )}
      {canEdit && (
        <>
          <ResizeHandle ref={nwRef} corner="nw" />
          <ResizeHandle ref={neRef} corner="ne" />
          <ResizeHandle ref={swRef} corner="sw" />
          <ResizeHandle ref={seRef} corner="se" />
        </>
      )}
    </motion.div>
  );
}

const cornerClass: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

// ponytail: duplicated from Card.tsx; extract to shared/ResizeHandle if a
// third call site shows up.
const ResizeHandle = forwardRef<
  HTMLDivElement,
  { corner: 'nw' | 'ne' | 'sw' | 'se' }
>(({ corner }, ref) => (
  <div
    ref={ref}
    onPointerDown={(e) => e.stopPropagation()}
    style={{ touchAction: 'none' }}
    className={`absolute z-10 flex h-4 w-4 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 ${cornerClass[corner]}`}
  >
    <div className="bg-fg h-2 w-2 rounded-full" />
  </div>
));
ResizeHandle.displayName = 'ResizeHandle';
