"use client";

import React, { useEffect, useRef } from "react";
import { applyMaskToCanvas } from "../../utils/canvasMasking";

interface MaskedPortraitProps {
  src: string;
  alt: string;
  maskSrc: string;
  className?: string;
  transitionDurationMs?: number;
  /**
   * Makes the portrait a way into the editor.
   *
   * It owns the click outright. It used to share the gesture with a swap
   * between the two built-in photographs, which could not work — one click
   * cannot both change the picture and open a modal — and where the picture
   * is editable, editing it is what clicking it should mean. The pair is
   * gone now, so opening the editor is the only thing a click can mean.
   */
  onActivate?: () => void;
  /** Replaces `alt` on the control when it does something. */
  actionLabel?: string;
  /** How the image sits inside the mask. See `applyMaskToCanvas`. */
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * MaskedPortrait component that applies a custom SVG mask to an image using Canvas API.
 * This approach works for both screen display and PDF generation since the mask is
 * applied programmatically rather than using CSS mask-image (which html2canvas doesn't support).
 */

export function MaskedPortrait({
  src,
  alt,
  maskSrc,
  className = "",
  transitionDurationMs = 250,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  onActivate,
  actionLabel,
}: MaskedPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const baseStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "auto",
    transition: `opacity ${transitionDurationMs}ms ease-in-out`,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    applyMaskToCanvas({
      canvas,
      imageSrc: src,
      maskSrc,
      scale: 1,
      size: 280,
      zoom,
      offsetX,
      offsetY,
    }).catch((error) => {
      console.error("Failed to apply mask to portrait:", error);
    });
  }, [src, maskSrc, zoom, offsetX, offsetY]);

  const interactive = Boolean(onActivate);

  return (
    <div
      // `cursor-pointer` only; nothing here may change the box, because the
      // header is measured to paginate the sheet and a hover ring or a border
      // would repaginate the document under the cursor.
      className={`relative inline-block ${
        onActivate ? "cursor-pointer" : ""
      } ${className}`}
      onClick={() => onActivate?.()}
      onKeyDown={(event) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      title={onActivate ? actionLabel : undefined}
      role={interactive ? "button" : "img"}
      aria-label={onActivate ? actionLabel ?? alt : alt}
      tabIndex={interactive ? 0 : undefined}
    >
      <canvas ref={canvasRef} style={baseStyle} />
    </div>
  );
}
