"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { MaskedPortrait } from "./common/MaskedPortrait";
import { MaskedBackground } from "./common/MaskedBackground";
import { usePortrait } from "../hooks/usePortrait";
import {
  backgroundScale,
  backgroundSvgUrl,
  DEFAULT_WAVE_AMPLITUDE,
  downscaleImage,
  hasWaves,
  portraitWidthRatio,
  PRESETS,
  SELECTABLE_PRESET_NAMES,
  setPortraitFraming,
  setPortraitImage,
  setPortraitShape,
  shapeSvgUrl,
  type PresetName,
  portraitSource
} from "../portrait";

/**
 * Choosing the portrait, and framing it inside the shape it is cut to.
 *
 * The picture used to be a 6.4MB PNG in `public/`, which meant changing it was
 * an edit to the repository rather than to the CV. It is a setting now, and
 * this is where it is set.
 *
 * The silhouette is two presets to start from and three independent controls to
 * adjust. Independent is the point: the presets used to be the only way in, and
 * `straight` removed the corner rounding along with the waves — two properties
 * that have nothing to do with each other, bundled because they happened to
 * share a name. Waves can now be switched off while the corners stay round.
 *
 * No model is involved in the image. "Make it fit" is a framing problem, and
 * framing is a crop: the reason a photograph sits badly in this mask is almost
 * always that its subject is off-centre or that the mask eats the headroom, and
 * a zoom and two offsets fix that exactly, offline, in a way the person can see
 * while they do it. Generative outpainting would fix the remainder — and would
 * mean sending someone's face to a hosted image model, which is the one thing
 * this project's architecture is arranged to avoid.
 */

type PortraitModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) => (
  <label className="block">
    <span className="flex items-baseline justify-between text-[11px] text-gray-600">
      {label}
      <span className="tabular-nums text-gray-400">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-1 w-full accent-[#65B7FF]"
    />
  </label>
);

export function PortraitModal({ isOpen, onClose }: PortraitModalProps) {
  const t = useTranslations('cv.portrait');
  const commonT = useTranslations('common');
  const { portrait } = usePortrait();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.document.addEventListener("keydown", onEscape);
    return () => window.document.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  /**
   * The depth to come back to when waves are switched on again.
   *
   * Held here rather than read off the shape, because switching them off is
   * what writes zero over the value that would otherwise be remembered. Set
   * from the toggle only — a ref updated during render is a value React is
   * entitled to discard.
   */
  const [restoreAmplitude, setRestoreAmplitude] = useState(
    DEFAULT_WAVE_AMPLITUDE
  );

  const upload = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      // Resized before it is stored, never after. The alternative — keeping the
      // original and scaling on every draw — puts a several-megabyte decode on
      // the path of every page load, which is what the shipped assets do today.
      setPortraitImage(await downscaleImage(file));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isOpen) return null;

  const { shape } = portrait;
  const waves = hasWaves(shape);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
            <p className="mt-1 text-xs text-gray-500">
              {t('description')}
            </p>
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

        <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
          {/* The real component, not a mock-up of one — what is previewed here
              is the same canvas pipeline the CV and the PDF export use. */}
          <div className="flex flex-col items-center gap-3">
            <MaskedBackground
              shapeSrc={backgroundSvgUrl(shape)}
              size={200 * backgroundScale(shape)}
              portraitWidthRatio={portraitWidthRatio(shape)}
              fillColor="#ffffff"
            >
              <MaskedPortrait
                src={portraitSource(portrait)}
                alt={t('previewAlt')}
                maskSrc={shapeSvgUrl(shape)}
                zoom={portrait.zoom}
                offsetX={portrait.offsetX}
                offsetY={portrait.offsetY}
              />
            </MaskedBackground>
            <label className="w-full">
              <span className="sr-only">{t('chooseImage')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => upload(event.target.files?.[0])}
                className="block w-full text-[11px] text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-[#65B7FF] file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-white hover:file:bg-[#529ED5]"
              />
            </label>
            {portrait.image && (
              <button
                type="button"
                onClick={() => setPortraitImage(null)}
                className="text-[11px] text-gray-500 underline underline-offset-2 hover:text-gray-700"
              >
                {t('useBuiltIn')}
              </button>
            )}
            {busy && <p className="text-[11px] text-gray-400">{t('resizing')}</p>}
            {error !== null && (
              <div className="text-[11px] text-red-600">
                <p>{t('imageUnreadable')}</p>
                {error && (
                  <details className="mt-1 text-[10px] text-red-500/80">
                    <summary className="cursor-pointer">
                      {commonT('technicalDetails')}
                    </summary>
                    <p className="mt-1 break-words font-mono">{error}</p>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-gray-700">{t('framing')}</legend>
              <Slider
                label={t('zoom')}
                value={portrait.zoom}
                min={1}
                max={3}
                step={0.01}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(zoom) => setPortraitFraming({ zoom })}
              />
              <Slider
                label={t('horizontal')}
                value={portrait.offsetX}
                min={-1}
                max={1}
                step={0.01}
                onChange={(offsetX) => setPortraitFraming({ offsetX })}
              />
              <Slider
                label={t('vertical')}
                value={portrait.offsetY}
                min={-1}
                max={1}
                step={0.01}
                onChange={(offsetY) => setPortraitFraming({ offsetY })}
              />
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-gray-700">
                {t('shape')}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {SELECTABLE_PRESET_NAMES.map((name: PresetName) => (
                  <button
                    key={name}
                    type="button"
                    // The whole preset, not just its name: the stored shape
                    // keeps the parameters of whatever was chosen last, and
                    // setting the label alone would leave a `straight` shape
                    // still carrying a wave's amplitude.
                    onClick={() => setPortraitShape({ preset: name, ...PRESETS[name] })}
                    className={`rounded px-2 py-1 text-[11px] capitalize transition-colors ${
                      shape.preset === name
                        ? "bg-[#65B7FF] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t(`preset.${name}`)}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={waves}
                  // Off is amplitude zero. Turning it back on restores the depth
                  // that was there before, so switching twice is not a way to
                  // lose a setting — and falls back to a visible default when
                  // the stored value is the zero we just wrote.
                  onChange={(event) => {
                    if (event.target.checked) {
                      setPortraitShape({ amplitude: restoreAmplitude });
                      return;
                    }
                    setRestoreAmplitude(shape.amplitude || DEFAULT_WAVE_AMPLITUDE);
                    setPortraitShape({ amplitude: 0 });
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-[#65B7FF] focus:ring-[#65B7FF]"
                />
                {t('waves')}
              </label>

              {waves && (
                <>
                  <Slider
                    label={t('waveDepth')}
                    value={shape.amplitude}
                    min={0.01}
                    max={0.6}
                    step={0.01}
                    onChange={(amplitude) => setPortraitShape({ amplitude })}
                  />
                  <Slider
                    label={t('waveCount')}
                    value={shape.frequency}
                    min={1}
                    max={5}
                    step={1}
                    format={(value) => String(value)}
                    onChange={(frequency) => setPortraitShape({ frequency })}
                  />
                </>
              )}

              {/* Outside the waves block on purpose: rounding is a property of
                  the corners, not of the edge, and burying it under a toggle
                  that removes the waves is what made the two inseparable. */}
              <Slider
                label={t('cornerRounding')}
                value={shape.rounding}
                min={0}
                max={1}
                step={0.01}
                onChange={(rounding) => setPortraitShape({ rounding })}
              />
            </fieldset>
          </div>
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
