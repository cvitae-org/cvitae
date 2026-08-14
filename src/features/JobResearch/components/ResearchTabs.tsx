"use client";

import { useRef, useState } from 'react';
import type { ResearchList } from '../types';
import { MANUAL_LIST_ID } from '../types';

type ResearchTabsProps = {
  lists: ResearchList[];
  activeListId: string;
  /** Offers per list id, so a tab can show its size without a second pass. */
  counts: Record<string, number>;
  onSelect: (listId: string) => void;
  onRename: (listId: string, name: string) => void;
  onClose: (listId: string) => void;
};

export function ResearchTabs({
  lists,
  activeListId,
  counts,
  onSelect,
  onRename,
  onClose
}: ResearchTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Escape blurs the input to leave editing, and blur is also what commits a
  // rename — so the cancel has to be recorded somewhere the blur handler can
  // read. A ref rather than state: it is consumed in the same tick, and
  // re-rendering on it would be a wasted pass.
  const cancelled = useRef(false);

  const finishEditing = (listId: string, value: string) => {
    if (!cancelled.current) onRename(listId, value);
    cancelled.current = false;
    setEditingId(null);
  };

  // A single tab is the state before the first import: the strip would be a
  // lone "Manual" label explaining nothing.
  if (lists.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Offer lists"
      className="flex items-stretch gap-1 overflow-x-auto border-b border-gray-200"
    >
      {lists.map((list) => {
        const isActive = list.id === activeListId;
        const count = counts[list.id] ?? 0;
        const isEditing = editingId === list.id;
        const closable = list.id !== MANUAL_LIST_ID;

        return (
          <div
            key={list.id}
            className={`flex flex-shrink-0 items-center gap-1 border-b-2 pb-1.5 pl-2 pr-1 transition-colors ${
              isActive ? 'border-[#65B7FF]' : 'border-transparent'
            }`}
          >
            {isEditing ? (
              <input
                autoFocus
                defaultValue={list.name}
                aria-label={`Rename ${list.name}`}
                // Renaming a tab is almost always replacing the filename, not
                // editing it, so the whole value starts selected.
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => finishEditing(list.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    cancelled.current = true;
                    event.currentTarget.blur();
                  }
                }}
                className="w-36 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#65B7FF]"
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(list.id)}
                onDoubleClick={() => setEditingId(list.id)}
                title={`${list.name} — double-click to rename`}
                className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="max-w-[168px] truncate">{list.name}</span>
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-normal tabular-nums ${
                    isActive
                      ? 'bg-[#65B7FF]/15 text-[#2a7fc4]'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            )}

            {/* Sibling rather than nested, since a button inside a button is
                invalid and the tab itself has to stay clickable. */}
            {closable && !isEditing && (
              <button
                type="button"
                onClick={() => onClose(list.id)}
                title={`Close ${list.name}`}
                aria-label={`Close ${list.name} and delete its offers`}
                className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
