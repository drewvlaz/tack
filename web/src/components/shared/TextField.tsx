import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export type TextFieldProps = {
  label: string;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  /** Validation/auth message rendered below the field. Sets aria-invalid. */
  error?: string | null;
  /** Optional supporting text shown when there's no error. */
  hint?: string;
  /** Element rendered inside the input on the trailing edge (e.g. eye toggle). */
  trailing?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

const INPUT_BASE =
  'w-full bg-surface-raised text-fg ring-1 ring-border/60 ' +
  'rounded-md px-3 py-2 text-sm ' +
  'outline-none transition-shadow ' +
  'focus-visible:ring-2 focus-visible:ring-focus ' +
  'placeholder:text-fg-subtle ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  'aria-[invalid=true]:ring-danger aria-[invalid=true]:ring-2';

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel = false, error, hint, trailing, className, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = rest.name ? `${rest.name}-${reactId}` : reactId;
  const messageId = error || hint ? `${inputId}-msg` : undefined;
  const hasTrailing = Boolean(trailing);

  return (
    <div className="block">
      <label
        htmlFor={inputId}
        className={
          hideLabel
            ? 'sr-only'
            : 'text-fg-muted block pb-1 text-xs'
        }
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={[
            INPUT_BASE,
            hasTrailing ? 'pr-9' : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {trailing && (
          // Adornment slot. Wrapper is inert (pointer-events disabled); the
          // child opts back in so clicks inside a button still work but
          // wrapping space doesn't steal focus from the input.
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center [&>*]:pointer-events-auto">
            {trailing}
          </div>
        )}
      </div>
      {(error || hint) && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={
            error
              ? 'mt-1 text-xs text-danger'
              : 'text-fg-subtle mt-1 text-xs'
          }
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export default TextField;
