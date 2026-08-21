"use client";

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/Sheet';
import { SheetNavigation } from '@/components/SheetNavigation';
import { LocalizedError } from '@/components/LocalizedError';
import { errorFromApi, type ErrorDescriptor } from '@/libs/i18n/errors';
import { usePathname, useRouter } from '@/libs/i18n/routing';
import type { Locale } from '@/libs/i18n/config';
import { providerIds, providers } from '@/libs/ai/providers';
import {
  DEFAULT_LOCAL_BASE_URL,
  loadSettings,
  saveSettings,
  toRequestOverride,
  type AiSettings
} from './aiSettings';

type TestResult =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok'; providerId: string; modelId: string; latencyMs: number }
  | { state: 'failed'; error: ErrorDescriptor };

type ModelOption = { id: string; name: string; contextLength: number | null };

type Catalogue =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; models: ModelOption[] }
  | { state: 'failed' };

export function Settings() {
  const t = useTranslations('settings');
  const commonT = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  // Read once on mount rather than in an effect; localStorage is synchronous
  // and the lazy initialiser keeps this off the server render.
  const [settings, setSettings] = useState<AiSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestResult>({ state: 'idle' });
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'idle' });

  const update = useCallback((patch: Partial<AiSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
    setSaved(true);
    setTest({ state: 'idle' });
  }, []);

  /**
   * Loads the free models the provider currently offers.
   *
   * On demand rather than on mount: it is a network call to a third party in
   * service of a field most people never touch, and the page is useful without
   * it. Nothing is preselected — a free model is a trade-off the user should
   * make deliberately, not one a settings page makes quietly on their behalf.
   */
  const loadCatalogue = useCallback(async () => {
    setCatalogue({ state: 'loading' });

    try {
      const response = await fetch(
        `/api/ai/models?providerId=${encodeURIComponent(settings.providerId)}`
      );
      const data = await response.json();

      setCatalogue(
        response.ok && Array.isArray(data.models)
          ? { state: 'ready', models: data.models as ModelOption[] }
          : { state: 'failed' }
      );
    } catch {
      setCatalogue({ state: 'failed' });
    }
  }, [settings.providerId]);

  const runTest = useCallback(async () => {
    setTest({ state: 'running' });

    try {
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: toRequestOverride(settings) })
      });
      const data = await response.json();

      setTest(
        data.ok
          ? {
              state: 'ok',
              providerId: data.providerId,
              modelId: data.modelId,
              latencyMs: data.latencyMs
            }
          : {
              state: 'failed',
              error: errorFromApi(data, 'providerFailed')
            }
      );
    } catch (error) {
      setTest({
        state: 'failed',
        error: {
          code: 'serverUnreachable',
          detail: error instanceof Error ? error.message : undefined
        }
      });
    }
  }, [settings]);

  const changeLanguage = useCallback(
    (nextLocale: Locale) => {
      if (nextLocale === locale) return;
      const suffix = `${window.location.search}${window.location.hash}`;
      router.replace(`${pathname}${suffix}`, { locale: nextLocale });
    },
    [locale, pathname, router]
  );

  const isLocal = settings.providerId === 'local';
  const activeProvider =
    settings.providerId === '' ? null : providers[settings.providerId];

  return (
    <div className="min-h-screen py-8">
      <div className="flex items-start justify-center gap-4 px-4">
        <div className="sticky top-8 flex flex-col gap-2 print:hidden">
          <SheetNavigation />
        </div>

        <Sheet>
          <header className="mb-5">
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t('description')}
            </p>
          </header>

          <div className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h2 className="text-sm font-semibold text-gray-900">
                {t('general.title')}
              </h2>
              <label
                htmlFor="interface-language"
                className="mt-3 block text-sm font-medium text-gray-700"
              >
                {t('general.language')}
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                {t('general.languageHint')}
              </p>
              <select
                id="interface-language"
                value={locale}
                onChange={(event) => changeLanguage(event.target.value as Locale)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
              >
                <option value="en">{commonT('english')}</option>
                <option value="pl">{commonT('polish')}</option>
              </select>
            </section>

            <h2 className="text-sm font-semibold text-gray-900">{t('ai.title')}</h2>
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
                {t('ai.provider')}
              </label>
              <select
                id="provider"
                value={settings.providerId}
                onChange={(event) =>
                  update({
                    providerId: event.target.value as AiSettings['providerId'],
                    modelId: ''
                  })
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
              >
                <option value="">{t('ai.serverDefault')}</option>
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providers[id].label}
                  </option>
                ))}
              </select>

              {activeProvider && (
                <p className="mt-2 text-xs text-gray-500">
                  {activeProvider.apiKeyEnvVar
                    ? t('ai.needsKey', { variable: activeProvider.apiKeyEnvVar })
                    : t('ai.noKey')}
                </p>
              )}
            </section>

            {isLocal && (
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label htmlFor="base-url" className="block text-sm font-medium text-gray-700">
                  {t('ai.localUrl')}
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t('ai.localUrlHint')}
                </p>
                <input
                  id="base-url"
                  type="url"
                  value={settings.localBaseUrl}
                  onChange={(event) => update({ localBaseUrl: event.target.value })}
                  placeholder={DEFAULT_LOCAL_BASE_URL}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
                />
              </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label htmlFor="model" className="block text-sm font-medium text-gray-700">
                {t('ai.model')}
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                {t('ai.modelHint', {
                  defaultModel:
                    settings.providerId !== ''
                      ? ` (${providers[settings.providerId].defaultModel})`
                      : ''
                })}
              </p>
              <input
                id="model"
                type="text"
                value={settings.modelId}
                onChange={(event) => update({ modelId: event.target.value })}
                placeholder={
                  settings.providerId !== ''
                    ? providers[settings.providerId].defaultModel
                    : t('ai.providerDefault')
                }
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
              />

              {settings.providerId === 'openrouter' && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {t('ai.freeModelsHint')}
                    </p>
                    <button
                      type="button"
                      onClick={loadCatalogue}
                      disabled={catalogue.state === 'loading'}
                      className="flex-shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                    >
                      {catalogue.state === 'loading'
                        ? commonT('loading')
                        : t('ai.freeModelsLoad')}
                    </button>
                  </div>

                  {catalogue.state === 'ready' &&
                    (catalogue.models.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {t('ai.freeModelsEmpty')}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {catalogue.models.map((model) => (
                          <li key={model.id}>
                            <button
                              type="button"
                              onClick={() => update({ modelId: model.id })}
                              className={`flex w-full flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white ${
                                settings.modelId === model.id ? 'bg-white' : ''
                              }`}
                            >
                              <code className="font-mono text-[11px] text-gray-800">
                                {model.id}
                              </code>
                              {model.contextLength && (
                                <span className="text-[10px] text-gray-400">
                                  {t('ai.contextTokens', {
                                    tokens: Math.round(model.contextLength / 1000)
                                  })}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ))}

                  {catalogue.state === 'failed' && (
                    <p className="mt-2 text-xs text-red-600">
                      {t('ai.freeModelsFailed')}
                    </p>
                  )}

                  <p className="mt-2 text-[11px] text-gray-400">
                    {t('ai.freeModelsCaveat')}
                  </p>
                </div>
              )}
            </section>

            {settings.providerId !== 'local' && (
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label
                  htmlFor="api-key"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('ai.apiKey')}{' '}
                  <span className="font-normal text-gray-400">
                    ({commonT('optional')})
                  </span>
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t('ai.apiKeyHint')}
                </p>
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.apiKey}
                  onChange={(event) => update({ apiKey: event.target.value })}
                  placeholder={t('ai.apiKeyPlaceholder')}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 placeholder:font-sans placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
                />
                <p className="mt-2 text-[11px] text-gray-400">
                  {t('ai.apiKeyStorage')}
                </p>
                {settings.apiKey.trim() && (
                  <button
                    type="button"
                    onClick={() => update({ apiKey: '' })}
                    className="mt-2 text-[11px] font-medium text-gray-500 underline hover:text-gray-700"
                  >
                    {t('ai.apiKeyClear')}
                  </button>
                )}
              </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label
                htmlFor="extraction-model"
                className="block text-sm font-medium text-gray-700"
              >
                {t('ai.extractionModel')}{' '}
                <span className="font-normal text-gray-400">
                  ({commonT('optional')})
                </span>
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                {t('ai.extractionHint')}
              </p>
              <input
                id="extraction-model"
                type="text"
                value={settings.extractionModelId}
                onChange={(event) =>
                  update({ extractionModelId: event.target.value })
                }
                placeholder={t('ai.extractionPlaceholder')}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
              />
            </section>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={runTest}
                disabled={test.state === 'running'}
                className="flex items-center gap-2 rounded-lg bg-[#65B7FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {test.state === 'running' ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('ai.testing')}
                  </>
                ) : (
                  t('ai.testConnection')
                )}
              </button>

              {saved && test.state === 'idle' && (
                <span className="text-xs text-gray-500">{t('ai.saved')}</span>
              )}
            </div>

            {test.state === 'ok' && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {t('ai.connected', {
                  provider: test.providerId,
                  model: test.modelId,
                  seconds: (test.latencyMs / 1000).toFixed(1)
                })}
              </div>
            )}

            {test.state === 'failed' && (
              <LocalizedError
                error={test.error}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              />
            )}

            <p className="text-xs text-gray-400">
              {t('ai.storageNote')}
            </p>
          </div>
        </Sheet>

        <div className="w-9 flex-shrink-0 print:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
