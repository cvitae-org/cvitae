"use client";

import React, { useEffect, useRef, useState } from "react";
import { applyMaskToCanvas } from "../../utils/canvasMasking";

interface MaskedPortraitProps {
  src: string;
  alt: string;
  maskSrc: string;
  className?: string;
  hoverSrc?: string;
  transitionDurationMs?: number;
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

/** How much of the portrait's height dissolves at the bottom. See `fadeBottom`. */
const PORTRAIT_BOTTOM_FADE = 0.18;
export function MaskedPortrait({
  src,
  alt,
  maskSrc,
  className = "",
  hoverSrc,
  transitionDurationMs = 250,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
}: MaskedPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isToggled, setIsToggled] = useState(false);

  const baseStyle: React.CSSProperties = {
    display: "block",
    maxWidth: "93%",
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
      fadeBottom: PORTRAIT_BOTTOM_FADE,
    }).catch((error) => {
      console.error("Failed to apply mask to portrait:", error);
    });
  }, [src, maskSrc, zoom, offsetX, offsetY]);

  useEffect(() => {
    if (!hoverSrc) return;

    const canvas = hoverCanvasRef.current;
    if (!canvas) return;

    applyMaskToCanvas({
      canvas,
      imageSrc: hoverSrc,
      maskSrc,
      scale: 1,
      size: 280,
      zoom,
      offsetX,
      offsetY,
      fadeBottom: PORTRAIT_BOTTOM_FADE,
    }).catch((error) => {
      console.error("Failed to apply mask to hover portrait:", error);
    });
  }, [hoverSrc, maskSrc, zoom, offsetX, offsetY]);

  return (
    <div
      className={`relative inline-block ${className}`}
      onClick={() => hoverSrc && setIsToggled((prev) => !prev)}
      onKeyDown={(event) => {
        if (!hoverSrc) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setIsToggled((prev) => !prev);
        }
      }}
      role={hoverSrc ? "button" : "img"}
      aria-label={alt}
      aria-pressed={hoverSrc ? isToggled : undefined}
      tabIndex={hoverSrc ? 0 : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{
          ...baseStyle,
          opacity: hoverSrc && isToggled ? 0 : 1,
        }}
      />
      {hoverSrc && (
        <canvas
          ref={hoverCanvasRef}
          style={{
            ...baseStyle,
            position: "absolute",
            inset: 0,
            opacity: isToggled ? 1 : 0,
            filter: "brightness(1.4)",
          }}
          aria-hidden={!isToggled}
        />
      )}
    </div>
  );
}
