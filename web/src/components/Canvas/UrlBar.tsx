import { useState } from 'react';
import UrlInputRow from '../shared/UrlInputRow';

type UrlBarProps = {
  onAdd: (url: string) => void;
  isPending: boolean;
};

export default function UrlBar({ onAdd, isPending }: UrlBarProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = value.trim();
    if (!url || isPending) {
      return;
    }
    onAdd(url);
    setValue('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-raised ring-border pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 shadow-lg ring-1"
    >
      <UrlInputRow
        value={value}
        onChange={setValue}
        isPending={isPending}
        inputClassName="w-[32rem]"
      />
    </form>
  );
}
