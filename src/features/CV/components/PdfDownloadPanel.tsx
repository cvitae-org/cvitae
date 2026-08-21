"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from 'next-intl';

export const PDF_DOWNLOAD_INFO_ID = "pdf-download-info";

export type PdfDownloadMessage = {
  key: string;
  text: string;
  detail?: string;
  severity: "warning" | "error";
};

type RegistryContextValue = {
  registerMessages: (source: string, messages: PdfDownloadMessage[]) => void;
};

const RegistryContext = createContext<RegistryContextValue | null>(null);

const MessagesContext = createContext<PdfDownloadMessage[]>([]);

export function PdfDownloadMessagesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [bySource, setBySource] = useState<
    Record<string, PdfDownloadMessage[]>
  >({});

  const registerMessages = useCallback(
    (source: string, messages: PdfDownloadMessage[]) => {
      setBySource((current) => {
        const next = messages.length > 0 ? messages : [];
        if (
          (current[source] ?? []).length === next.length &&
          (current[source] ?? []).every(
            (item, index) =>
              item.key === next[index]?.key &&
              item.text === next[index]?.text &&
              item.detail === next[index]?.detail
          )
        ) {
          return current;
        }
        return { ...current, [source]: next };
      });
    },
    []
  );

  const allMessages = useMemo(
    () => Object.values(bySource).flat(),
    [bySource]
  );

  const registry = useMemo(
    () => ({ registerMessages }),
    [registerMessages]
  );

  return (
    <RegistryContext.Provider value={registry}>
      <MessagesContext.Provider value={allMessages}>
        {children}
      </MessagesContext.Provider>
    </RegistryContext.Provider>
  );
}

function usePdfDownloadRegistry() {
  return useContext(RegistryContext);
}

export function usePdfDownloadMessages() {
  return useContext(MessagesContext);
}

export function useRegisterPdfDownloadMessages(
  source: string,
  messages: PdfDownloadMessage[]
) {
  const registry = usePdfDownloadRegistry();
  const serialized = JSON.stringify(messages);

  React.useEffect(() => {
    if (!registry) return;
    registry.registerMessages(source, messages);
    return () => registry.registerMessages(source, []);
    // Serialized so equivalent message lists do not re-register every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages derived from serialized
  }, [registry, source, serialized]);
}

export function PdfDownloadInfoPanel({ className = "" }: { className?: string }) {
  const messages = usePdfDownloadMessages();
  const t = useTranslations('cv.pdf');
  const commonT = useTranslations('common');

  return (
    <div
      id={PDF_DOWNLOAD_INFO_ID}
      className={`rounded-md border border-gray-200 bg-gray-50 p-3 print:hidden ${className}`}
    >
      <p className="text-[10px] leading-snug text-amber-700">
        {t('designedInfo')}
      </p>
      {messages.map((message) => (
        <div
          key={message.key}
          className={`mt-1 text-xs leading-relaxed ${
            message.severity === "error" ? "text-red-600" : "text-amber-700"
          }`}
        >
          <p>{message.text}</p>
          {message.detail && (
            <details className="mt-1 text-[10px] text-gray-500">
              <summary className="cursor-pointer">{commonT('technicalDetails')}</summary>
              <p className="mt-1 break-words font-mono">{message.detail}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

export function PdfDownloadWarningButton() {
  const messages = usePdfDownloadMessages();
  const t = useTranslations('cv.pdf');

  if (messages.length === 0) return null;

  // The panel is a `<details>` and, on the CV page, a docked one: scrolling to
  // it is not enough when it is both collapsed and already on screen, so open it
  // first. Setting `.open` fires `toggle`, which is how the panel's own state
  // finds out.
  const revealInfo = () => {
    const panel = document.getElementById(PDF_DOWNLOAD_INFO_ID);
    if (panel instanceof HTMLDetailsElement) panel.open = true;
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <button
      type="button"
      onClick={revealInfo}
      title={t('viewWarnings')}
      aria-label={t('viewWarnings')}
      className="relative flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-800 shadow-sm transition-colors duration-200 hover:bg-amber-200"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
    </button>
  );
}
