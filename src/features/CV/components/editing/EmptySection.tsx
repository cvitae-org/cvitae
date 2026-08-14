"use client";

/**
 * What an empty section shows instead of nothing.
 *
 * The CV starts blank, and a blank document that renders as blank gives no
 * indication that any of it can be filled in — the sections would collapse to
 * their headings and the page would read as broken rather than as empty. So an
 * empty section renders one greyed row shaped like the real thing, and clicking
 * it creates a real entry and puts the cursor in it.
 *
 * The row is a `button` rather than a styled `div` so it is reachable by
 * keyboard and announced as an action, and it is removed from print: an
 * exported PDF should show an empty section as empty, not as an invitation.
 */

type EmptySectionProps = {
  /** Shaped like the content it stands in for, e.g. "Language — Level". */
  hint: string;
  onCreate: () => void;
  label: string;
};

export function EmptySection({ hint, onCreate, label }: EmptySectionProps) {
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label={label}
      className="block w-full rounded-sm px-1 py-0.5 text-left text-xs italic text-gray-300 transition-colors hover:bg-[#65B7FF]/10 hover:text-gray-400 focus:bg-[#65B7FF]/10 focus:outline-none focus:ring-1 focus:ring-[#65B7FF] print:hidden"
    >
      {hint}
    </button>
  );
}
