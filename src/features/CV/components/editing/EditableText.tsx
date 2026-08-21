"use client";

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

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
  /**
   * Set when the placeholder is the content, not a hint about it.
   *
   * Most empty fields are simply unfilled, and their placeholder is scaffolding
   * that must not reach the PDF — an exported CV should not advertise "Phone
   * number" where a phone number isn't. But a few fields mean something by being
   * empty: a job with no `finished` date is ongoing, and "Present" is how that
   * reads. Hiding those on export leaves "June 2025 –" trailing into nothing.
   */
  placeholderIsValue?: boolean;
  className?: string;
  /** Allows newlines. Off by default: most CV fields are one line. */
  multiline?: boolean;
  /** Rendered as this element, so editing does not change the typography. */
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
  ariaLabel?: string;
  /**
   * Where this text points, for the PDF export only.
   *
   * Not an `href`, and deliberately not an anchor: clicking an anchor whose text
   * is `contentEditable` navigates, which is the gesture that is supposed to
   * place a caret. `usePDFGenerator` reads this off the DOM and adds a link
   * annotation over the rendered rectangle, so the exported file has a real
   * clickable link and the editable page has none.
   */
  pdfLink?: string;
};

export function EditableText({
  value,
  onCommit,
  placeholder,
  placeholderIsValue = false,
  className = '',
  multiline = false,
  as: Tag = 'span',
  ariaLabel,
  pdfLink
}: EditableTextProps) {
  const t = useTranslations('cv.editor');
  const resolvedPlaceholder = placeholder ?? t('notSet');
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

  // Grey says "nothing here yet", which is wrong for a placeholder that is the
  // value: an ongoing job reads "June 2025 – Present", and rendering half of
  // that in placeholder grey made it look like the field had been missed. It
  // was one string in normal weight before the CV became editable, and it
  // should still look like one.
  const showsHint = empty && !placeholderIsValue;

  return (
    <Tag
      ref={ref as React.Ref<never>}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-placeholder={resolvedPlaceholder}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      data-placeholder={resolvedPlaceholder}
      // Both are read by the PDF export and by nothing else. This one marks a
      // placeholder that is only a hint: it is a `::before`, and html2canvas
      // resolves pseudo content into real nodes, so without a way to find these
      // an unfilled phone number exports as the words "Phone number" in grey.
      data-cv-hint={showsHint ? '' : undefined}
      data-cv-link={pdfLink || undefined}
      className={`${className} cursor-text rounded-sm outline-none transition-colors hover:bg-[#65B7FF]/10 focus:bg-[#65B7FF]/10 focus:ring-1 focus:ring-[#65B7FF] ${
        empty ? 'before:content-[attr(data-placeholder)]' : ''
      } ${showsHint ? 'text-gray-300' : ''} print:hover:bg-transparent print:focus:bg-transparent print:focus:ring-0`}
    />
  );
}
