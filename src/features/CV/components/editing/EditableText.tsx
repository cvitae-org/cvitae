"use client";

import { useEffect, useRef, useState } from 'react';

/**
 * A span you click to edit.
 *
 * `contentEditable` rather than swapping in an `<input>`, because the CV is a
 * paginated document whose layout is measured: an input has its own metrics —
 * borders, padding, line-height — so a field that becomes one is a field that
 * changes height the moment it is focused, and `useCVLayout` would repaginate
 * under the cursor. Editing in place keeps the text in the same box it renders
 * in, so nothing moves.
 *
 * The value is committed on blur, not on every keystroke. Each commit is a
 * store write and each store write is a whole-document IndexedDB put — the
 * persisted store coalesces those, but it cannot coalesce the re-render, and
 * repaginating an A4 document per character is visible. Escape abandons the
 * edit, which is the only way back from a mistake in a field with no undo.
 */

type EditableTextProps = {
  value: string;
  onCommit: (value: string) => void;
  /** Shown greyed when the value is empty, so an unfilled field is findable. */
  placeholder?: string;
  className?: string;
  /** Allows newlines. Off by default: most CV fields are one line. */
  multiline?: boolean;
  /** Rendered as this element, so editing does not change the typography. */
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
  ariaLabel?: string;
};

export function EditableText({
  value,
  onCommit,
  placeholder = 'Not set',
  className = '',
  multiline = false,
  as: Tag = 'span',
  ariaLabel
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);

  // The DOM node holds the text while editing, so React must not re-render over
  // it — but it does have to be resynchronised when the value changes from
  // somewhere else, such as an import landing or the language being switched.
  useEffect(() => {
    if (editing) return;
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = (ref.current?.textContent ?? '').replace(/ /g, ' ');

    // contentEditable leaves a trailing newline on some browsers, and a value
    // that only differs by whitespace is not a change worth a write and a
    // repagination.
    const cleaned = multiline ? next.replace(/\n+$/, '') : next.replace(/\s+/g, ' ').trim();

    if (cleaned !== value) onCommit(cleaned);
    else if (ref.current) ref.current.textContent = value;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Restore first, then blur: blurring would otherwise commit what is
      // currently in the node, which is exactly what Escape is refusing.
      if (ref.current) ref.current.textContent = value;
      setEditing(false);
      ref.current?.blur();
      return;
    }

    if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      ref.current?.blur();
    }
  };

  const empty = !value;

  return (
    <Tag
      ref={ref as React.Ref<never>}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-placeholder={placeholder}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      data-placeholder={placeholder}
      className={`${className} cursor-text rounded-sm outline-none transition-colors hover:bg-[#65B7FF]/10 focus:bg-[#65B7FF]/10 focus:ring-1 focus:ring-[#65B7FF] ${
        empty ? 'text-gray-300 before:content-[attr(data-placeholder)]' : ''
      } print:hover:bg-transparent print:focus:bg-transparent print:focus:ring-0`}
    />
  );
}
