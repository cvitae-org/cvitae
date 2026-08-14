"use client";

import { useCallback, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { SheetNavLink } from '@/components/SheetNavLink';
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
  | { state: 'failed'; error: string };

export function Settings() {
  // Read once on mount rather than in an effect; localStorage is synchronous
  // and the lazy initialiser keeps this off the server render.
  const [settings, setSettings] = useState<AiSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestResult>({ state: 'idle' });

  const update = useCallback((patch: Partial<AiSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
    setSaved(true);
    setTest({ state: 'idle' });
  }, []);

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
          : { state: 'failed', error: data.error }
      );
    } catch {
      setTest({ state: 'failed', error: 'Could not reach the app server.' });
    }
  }, [settings]);

  const isLocal = settings.providerId === 'local';
  const activeProvider =
    settings.providerId === '' ? null : providers[settings.providerId];

  return (
    <div className="min-h-screen py-8">
      <div className="flex items-start justify-center gap-4 px-4">
        <div className="sticky top-8 flex flex-col gap-2 print:hidden">
          <SheetNavLink href="/" title="CV">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </SheetNavLink>
          <SheetNavLink href="/research" title="Job offer research">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </SheetNavLink>
          <SheetNavLink href="/submitting" title="Submitting">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </SheetNavLink>
        </div>

        <Sheet>
          <header className="mb-5">
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Choose which AI answers CV customisation and offer research.
            </p>
          </header>

          <div className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
                Provider
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
                <option value="">Server default (AI_PROVIDER)</option>
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providers[id].label}
                  </option>
                ))}
              </select>

              {activeProvider && (
                <p className="mt-2 text-xs text-gray-500">
                  {activeProvider.apiKeyEnvVar
                    ? `Needs ${activeProvider.apiKeyEnvVar} set on the server. Keys are never stored in the browser.`
                    : 'No API key needed — the server talks to your machine.'}
                </p>
              )}
            </section>

            {isLocal && (
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label htmlFor="base-url" className="block text-sm font-medium text-gray-700">
                  Local server URL
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Ollama <code>:11434/v1</code> · LM Studio <code>:1234/v1</code> ·
                  llama.cpp / vLLM <code>:8080/v1</code>. Must be localhost.
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
                Model
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                Leave empty to use the provider default
                {settings.providerId !== '' && (
                  <>
                    {' '}
                    (<code>{providers[settings.providerId].defaultModel}</code>)
                  </>
                )}
                .
              </p>
              <input
                id="model"
                type="text"
                value={settings.modelId}
                onChange={(event) => update({ modelId: event.target.value })}
                placeholder={
                  settings.providerId !== ''
                    ? providers[settings.providerId].defaultModel
                    : 'provider default'
                }
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#65B7FF]"
              />
            </section>

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label
                htmlFor="extraction-model"
                className="block text-sm font-medium text-gray-700"
              >
                Extraction model{' '}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                Runs offer research, which only pulls values straight out of the
                posting and so does not need a large model — on a local server
                this is the difference between minutes and seconds. The model
                above handles CV customisation. Leave empty to use one model for
                everything.
              </p>
              <input
                id="extraction-model"
                type="text"
                value={settings.extractionModelId}
                onChange={(event) =>
                  update({ extractionModelId: event.target.value })
                }
                placeholder="e.g. gemma3:4b"
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
                    Testing…
                  </>
                ) : (
                  'Test connection'
                )}
              </button>

              {saved && test.state === 'idle' && (
                <span className="text-xs text-gray-500">Saved to this browser.</span>
              )}
            </div>

            {test.state === 'ok' && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Connected to <strong>{test.providerId}</strong> ·{' '}
                <code>{test.modelId}</code> in {(test.latencyMs / 1000).toFixed(1)}s.
              </div>
            )}

            {test.state === 'failed' && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {test.error}
              </div>
            )}

            <p className="text-xs text-gray-400">
              Stored in this browser only. API keys stay in server environment
              variables and are never sent from or saved in the browser.
            </p>
          </div>
        </Sheet>

        <div className="w-9 flex-shrink-0 print:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
