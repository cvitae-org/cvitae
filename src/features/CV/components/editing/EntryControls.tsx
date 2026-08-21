"use client";

import { useTranslations } from 'next-intl';

/**
 * The add and remove affordances on a list entry.
 *
 * Hidden until the row is hovered or something inside it has focus, and removed
 * entirely from print. A CV is a document that gets exported to PDF and looked
 * at by someone else; controls that are always visible would be in the way of
 * reading it, and controls that survive into the export would be in the file.
 *
 * Keyboard reachability is why this is `opacity` and `focus-within` rather than
 * `hidden`: a control that is not rendered cannot be tabbed to, which would put
 * "delete this job" out of reach of anyone not using a mouse.
 */

type EntryControlsProps = {
  onAdd?: () => void;
  onRemove?: () => void;
  addLabel?: string;
  removeLabel?: string;
};

const buttonClass =
  'rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-[#65B7FF]';

export function EntryControls({
  onAdd,
  onRemove,
  addLabel,
  removeLabel
}: EntryControlsProps) {
  const t = useTranslations('cv.editor');
  const resolvedAddLabel = addLabel ?? t('add');
  const resolvedRemoveLabel = removeLabel ?? t('remove');
  // A section-level "add" has no row to hover, so hiding it until hover would
  // hide it permanently — and it is the only way to put the first entry into an
  // empty section. Per-entry controls still reveal on hover, so a filled CV
  // reads as a document rather than a form.
  const reveals = Boolean(onRemove);

  return (
    <span
      className={`inline-flex items-center gap-1 transition-opacity print:hidden ${
        reveals
          ? 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          : ''
      }`}
    >
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={resolvedRemoveLabel}
          title={resolvedRemoveLabel}
          className={buttonClass}
        >
          {t('remove')}
        </button>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={resolvedAddLabel}
          title={resolvedAddLabel}
          className={buttonClass}
        >
          + {t('add')}
        </button>
      )}
    </span>
  );
}
