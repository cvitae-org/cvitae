"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MaskedPortrait } from "./common/MaskedPortrait";
import { MaskedBackground } from "./common/MaskedBackground";
import { usePortrait } from "../hooks/usePortrait";
import {
  backgroundScale,
  backgroundSvgUrl,
  downscaleImage,
  portraitWidthRatio,
  PRESET_NAMES,
  PRESETS,
  setPortraitFraming,
  setPortraitImage,
  setPortraitShape,
  shapeSvgUrl,
  type PresetName,
} from "../portrait";

/**
 * Choosing the portrait and the shape it is cut to.
 *
 * Both used to be files in `public/` — a 6.4MB PNG and a hand-drawn SVG path —
 * which meant changing either was an edit to the repository rather than to the
 * CV. They are settings now, and this is where they are set.
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
      setError(problem instanceof Error ? problem.message : "That image could not be read.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isOpen) return null;

  const { shape } = portrait;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Portrait</h2>
            <p className="mt-1 text-xs text-gray-500">
              The photograph and the shape it is cut to. Everything here stays in
              this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
                src={portrait.image ?? "/me2.png"}
                alt="Portrait preview"
                maskSrc={shapeSvgUrl(shape)}
                zoom={portrait.zoom}
                offsetX={portrait.offsetX}
                offsetY={portrait.offsetY}
              />
            </MaskedBackground>
            <label className="w-full">
              <span className="sr-only">Choose an image</span>
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
                Use the built-in photo
              </button>
            )}
            {busy && <p className="text-[11px] text-gray-400">Resizing…</p>}
            {error && <p className="text-[11px] text-red-600">{error}</p>}
          </div>

          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-gray-700">Framing</legend>
              <Slider
                label="Zoom"
                value={portrait.zoom}
                min={1}
                max={3}
                step={0.01}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(zoom) => setPortraitFraming({ zoom })}
              />
              <Slider
                label="Horizontal"
                value={portrait.offsetX}
                min={-1}
                max={1}
                step={0.01}
                onChange={(offsetX) => setPortraitFraming({ offsetX })}
              />
              <Slider
                label="Vertical"
                value={portrait.offsetY}
                min={-1}
                max={1}
                step={0.01}
                onChange={(offsetY) => setPortraitFraming({ offsetY })}
              />
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-gray-700">Shape</legend>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_NAMES.map((name: PresetName) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPortraitShape({ preset: name, ...PRESETS[name] })}
                    className={`rounded px-2 py-1 text-[11px] capitalize transition-colors ${
                      shape.preset === name
                        ? "bg-[#65B7FF] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {shape.preset === "classic" ? (
                /*
                  The original is a drawn curve, not a generated one, so there
                  are no parameters behind it to move. Saying so is better than
                  showing sliders that would silently discard the shape the CV
                  has always had the moment one of them is touched.
                */
                <p className="text-[11px] text-gray-400">
                  The original hand-drawn outline. Pick another preset to adjust
                  the curve.
                </p>
              ) : (
                <>
                  <Slider
                    label="Wave depth"
                    value={shape.amplitude}
                    min={0}
                    max={0.6}
                    step={0.01}
                    onChange={(amplitude) => setPortraitShape({ amplitude })}
                  />
                  <Slider
                    label="Waves"
                    value={shape.frequency}
                    min={1}
                    max={5}
                    step={1}
                    format={(v) => String(v)}
                    onChange={(frequency) => setPortraitShape({ frequency })}
                  />
                  <Slider
                    label="Corner rounding"
                    value={shape.rounding}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(rounding) => setPortraitShape({ rounding })}
                  />
                </>
              )}
            </fieldset>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#65B7FF] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#529ED5]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
