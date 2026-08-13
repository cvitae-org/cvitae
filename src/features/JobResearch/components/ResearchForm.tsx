"use client";

import { useCallback, useState } from 'react';
import type { ResearchError } from '../hooks/useJobResearch';

type ResearchFormProps = {
  onResearch: (input: { url: string; offerText?: string }) => void;
  isResearching: boolean;
  error: ResearchError | null;
  onDismissError: () => void;
};

export function ResearchForm({
  onResearch,
  isResearching,
  error,
  onDismissError
}: ResearchFormProps) {
  const [url, setUrl] = useState('');
  const [offerText, setOfferText] = useState('');

  // Only shown once a fetch has actually failed, so the common path stays a
  // single input rather than a URL box plus a big empty textarea.
  const showManualPaste = Boolean(error?.needsManualText);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onResearch({ url, offerText: showManualPaste ? offerText : undefined });
    },
    [onResearch, url, offerText, showManualPaste]
  );

  const handleUrlChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(event.target.value);
      if (error) onDismissError();
    },
    [error, onDismissError]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
    >
      <label
        htmlFor="offer-url"
        className="block text-sm font-medium text-gray-700"
      >
        Job offer URL
      </label>
      <p className="mt-0.5 text-xs text-gray-500">
        Paste a link to the posting. The offer is fetched, analysed against your
        CV, and added to the table below.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          id="offer-url"
          type="url"
          value={url}
          onChange={handleUrlChange}
          disabled={isResearching}
          placeholder="https://nofluffjobs.com/pl/job/..."
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF] disabled:bg-gray-50 disabled:text-gray-500"
        />
        <button
          type="submit"
          disabled={isResearching || (!url.trim() && !offerText.trim())}
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isResearching ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Researching…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Research
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error.message}</span>
        </div>
      )}

      {showManualPaste && (
        <div className="mt-4">
          <label
            htmlFor="offer-text"
            className="block text-sm font-medium text-gray-700"
          >
            Offer text
          </label>
          <p className="mt-0.5 text-xs text-gray-500">
            Copy the posting from the page and paste it here. The URL above is
            kept with the record.
          </p>
          <textarea
            id="offer-text"
            value={offerText}
            onChange={(event) => setOfferText(event.target.value)}
            disabled={isResearching}
            placeholder="Paste the full job offer description…"
            className="mt-2 h-40 w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF] disabled:bg-gray-50"
          />
        </div>
      )}
    </form>
  );
}
