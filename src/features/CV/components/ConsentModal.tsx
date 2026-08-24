"use client";

import React, { useId } from "react";
import { useTranslations } from 'next-intl';
import { useCvDocument } from '../hooks/useCvDocument';
import { consentClause, matchConsentPreset } from '../consent';
import { setConsent } from '../store';

/**
 * Editing the clause the CV closes with.
 *
 * Built like `PortraitModal` — opened from the rail, writing straight to the
 * store, closed with Done rather than saved. The CV is behind the dialog and
 * re-paginates as you type, which is the point: a clause that pushes the last
 * role onto a fourth page is a thing to see while you write it, not after.
 *
 * The checkboxes and the textarea are two views of one string, not two settings
 * that have to agree. Ticking a box writes the composed clause; typing replaces
 * it with whatever was typed. That is why there is no third "custom" mode to
 * get stuck in — `matchConsentPreset` just asks the text what it is each render,
 * and text nobody recognises simply leaves both boxes clear.
 */

type ConsentModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const Checkbox = ({
  label,
  hint,
  checked,
  disabled,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) => {
  const hintId = useId();

  return (
    <label
      className={`flex gap-3 rounded border p-3 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-gray-100 bg-gray-50/60'
          : 'cursor-pointer border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/*
        Named and described separately, rather than left to the wrapping label.
        Implicit labelling would fold the hint into the accessible name and
        announce the whole paragraph as the control's title; the hint is a
        description, and the distinction is what `aria-describedby` is for.
      */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#65B7FF] disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span
          className={`block text-xs font-medium ${
            disabled ? 'text-gray-400' : 'text-gray-800'
          }`}
        >
          {label}
        </span>
        <span
          id={hintId}
          className={`mt-0.5 block text-[11px] leading-snug ${
            disabled ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {hint}
        </span>
      </span>
    </label>
  );
};

export function ConsentModal({ isOpen, onClose }: ConsentModalProps) {
  const t = useTranslations('cv.consent');
  const commonT = useTranslations('common');
  const { document, locale } = useCvDocument();

  if (!isOpen) return null;

  const clause = document.consent;
  const preset = matchConsentPreset(locale, clause);
  // A blank clause is "no clause", never an unrecognised one: the box has to
  // clear when the text is emptied by hand, or unticking it would leave a
  // checked box over an empty CV footer.
  const hasClause = clause.trim().length > 0;
  const rodo = preset !== null;
  const future = preset?.future ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
            <p className="mt-1 text-xs text-gray-500">{t('description')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={commonT('close')}
            className="rounded px-2 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-gray-700">
              {t('presets')}
            </legend>
            <Checkbox
              label={t('rodo')}
              hint={t('rodoHint')}
              checked={rodo}
              onChange={(checked) =>
                setConsent(
                  locale,
                  // Unticking clears rather than reverting to some shorter
                  // sentence: the switch is whether the CV carries a clause.
                  checked ? consentClause(locale, { future }) : ''
                )
              }
            />
            <Checkbox
              label={t('future')}
              hint={t('futureHint')}
              checked={future}
              // Nothing to extend without a clause, and a tickable box here
              // would have to invent the base sentence to attach itself to.
              disabled={!rodo}
              onChange={(checked) =>
                setConsent(locale, consentClause(locale, { future: checked }))
              }
            />
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              {t('text')}
            </span>
            <textarea
              value={clause}
              onChange={(event) => setConsent(locale, event.target.value)}
              rows={4}
              placeholder={t('placeholder')}
              className="w-full resize-y rounded border border-gray-200 px-2 py-1.5 text-xs leading-relaxed text-gray-800 outline-none transition-colors focus:border-[#65B7FF] focus:ring-1 focus:ring-[#65B7FF]"
            />
            <span className="mt-1 block text-[11px] text-gray-500">
              {!hasClause
                ? t('emptyNote')
                : rodo
                  ? t('presetNote')
                  : t('customNote')}
            </span>
          </label>
        </div>

        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5]"
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
