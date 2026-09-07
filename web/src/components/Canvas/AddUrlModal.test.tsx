import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HotkeyProvider } from '../../hooks/HotkeyProvider';
import AddUrlModal from './AddUrlModal';

function renderModal(
  overrides: Partial<React.ComponentProps<typeof AddUrlModal>> = {},
) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <HotkeyProvider>
      <AddUrlModal
        open
        isPending={false}
        onSubmit={onSubmit}
        onClose={onClose}
        {...overrides}
      />
    </HotkeyProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Product URL' });
  return { ...utils, input, onSubmit, onClose };
}

describe('AddUrlModal', () => {
  it('submits on a single Enter after typing', () => {
    const { input, onSubmit, onClose } = renderModal();
    fireEvent.change(input, { target: { value: 'https://example.com/shirt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('https://example.com/shirt');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits on a single Enter after paste (DOM value, not React state)', () => {
    const { input, onSubmit } = renderModal();
    // Native paste updates the input before React re-renders. keyDown must
    // still see the pasted string.
    fireEvent.input(input, { target: { value: 'https://example.com/pasted' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('https://example.com/pasted');
  });

  it('treats empty Enter + a following change as autofill commit, then submits', () => {
    const { input, onSubmit } = renderModal();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'https://example.com/auto' } });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('https://example.com/auto');
  });

  it('does not submit an empty field', () => {
    const { input, onSubmit } = renderModal();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
