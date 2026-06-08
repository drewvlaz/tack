import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md';

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Optional element rendered on the leading edge (icon, spinner). */
  leading?: ReactNode;
  /** Optional element rendered on the trailing edge. */
  trailing?: ReactNode;
  /** Force button to fill its container. */
  block?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    children?: ReactNode;
  };

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-fg text-surface hover:opacity-90',
  secondary:
    'bg-surface-muted text-fg ring-1 ring-border/60 hover:bg-surface-muted/70',
  ghost: 'text-fg-muted hover:text-fg',
  destructive:
    'bg-danger-soft text-danger ring-1 ring-danger/30 hover:bg-danger-soft/70 dark:text-danger',
};

const SIZE_CLASSES: Record<Size, string> = {
  // Heights track touch-target guidance (≥24px hit area; 36px md keeps to
  // ~44px including padding for the loose body click region).
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-md font-medium ' +
  'transition-colors outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leading,
    trailing,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        BASE,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : leading}
      {children}
      {trailing}
    </button>
  );
});

export default Button;

function Spinner() {
  return (
    <span
      className="block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}
