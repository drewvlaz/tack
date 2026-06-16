import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TextCard from './TextCard';

// Render with one shape of style knobs cleared — the keyboard state machine
// is what matters here, not the cosmetics. Returns the outer container so
// double-clicks target the wrapper (motion.div), not the duplicated-text
// inner div that getByText would also match.
function renderTextCard(
  overrides: Partial<React.ComponentProps<typeof TextCard>> = {},
) {
  const onCommit = vi.fn();
  const utils = render(
    <TextCard
      id="t1"
      content="hello"
      fontSize={null}
      fontWeight={null}
      colorToken={null}
      align={null}
      x={0}
      y={0}
      canEdit
      onCommit={onCommit}
      {...overrides}
    />,
  );
  const wrapper = utils.container.firstChild as HTMLElement;
  return { ...utils, wrapper, onCommit };
}

describe('TextCard edit state machine', () => {
  it('does nothing on double-click when canEdit is false', () => {
    const { wrapper, queryByRole, onCommit } = renderTextCard({
      canEdit: false,
    });
    fireEvent.doubleClick(wrapper);
    expect(queryByRole('textbox')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('double-click → type → Enter commits the new value', () => {
    const { wrapper, getByRole, queryByRole, onCommit } = renderTextCard();
    fireEvent.doubleClick(wrapper);
    const ta = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'goodbye' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('goodbye');
    expect(queryByRole('textbox')).toBeNull();
  });

  it('Esc cancels the edit and does not commit', () => {
    const { wrapper, getByRole, queryByRole, onCommit } = renderTextCard();
    fireEvent.doubleClick(wrapper);
    const ta = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'never persisted' } });
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(queryByRole('textbox')).toBeNull();
  });

  it('blur commits when the value changed', () => {
    const { wrapper, getByRole, onCommit } = renderTextCard();
    fireEvent.doubleClick(wrapper);
    const ta = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'blurred' } });
    fireEvent.blur(ta);
    expect(onCommit).toHaveBeenCalledWith('blurred');
  });

  it('Shift+Enter inserts a newline instead of committing', () => {
    const { wrapper, getByRole, onCommit } = renderTextCard();
    fireEvent.doubleClick(wrapper);
    const ta = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(onCommit).not.toHaveBeenCalled();
    expect(getByRole('textbox')).toBeInTheDocument();
  });

  it('commit is suppressed when the value is unchanged', () => {
    const { wrapper, getByRole, onCommit } = renderTextCard();
    fireEvent.doubleClick(wrapper);
    const ta = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
