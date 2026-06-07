import { useState } from 'react';
import UrlInputRow from '../shared/UrlInputRow';

type UrlBarProps = {
  onAdd: (url: string) => void;
  isPending: boolean;
  errorMessage: string | null;
  onClearError: () => void;
};

export default function UrlBar({
  onAdd,
  isPending,
  errorMessage,
  onClearError,
}: UrlBarProps) {
  const [value, setValue] = useState('');

  function handleChange(v: string) {
    if (errorMessage) onClearError();
    setValue(v);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = value.trim();
    if (!url || isPending) return;
    onAdd(url);
    setValue('');
  }

  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-raised ring-border flex items-center gap-2 rounded-full px-3 py-2 shadow-lg ring-1"
      >
        <UrlInputRow
          value={value}
          onChange={handleChange}
          isPending={isPending}
          inputClassName="w-[32rem]"
        />
      </form>
      {errorMessage && (
        <p
          role="alert"
          className="bg-surface-raised ring-border max-w-[34rem] rounded-md px-3 py-1.5 text-center text-xs text-red-600 shadow ring-1 dark:text-red-400"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
