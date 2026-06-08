import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'ghost' | 'raised';
type Size = 'sm' | 'md';

export type IconButtonProps = {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>;

const VARIANT_CLASSES: Record<Variant, string> = {
  // Bare round affordance that lives inside other surfaces (e.g. sidebar rows,
  // input adornments).
  ghost: 'text-fg-subtle hover:text-fg',
  // Floating affordance with its own background — used over the canvas.
  raised:
    'bg-surface-raised text-fg-muted hover:text-fg ring-1 ring-border shadow-md',
};

const SIZE_CLASSES: Record<Size, string> = {
  // h/w match the existing 7×7 / 8×8 patterns scattered through AppUI and
  // BoardsSidebar — keep these in sync if you adjust them.
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
};

const BASE =
  'inline-flex items-center justify-center rounded-full ' +
  'transition-colors outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface ' +
  'disabled:opacity-40 disabled:pointer-events-none';

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      variant = 'ghost',
      size = 'md',
      className,
      type = 'button',
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={[
          BASE,
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export default IconButton;
