"use client";

import React, { useEffect, useRef } from "react";
import { renderBackgroundShape } from "../../utils/canvasBackground";

interface MaskedBackgroundProps {
  children: React.ReactNode;
  shapeSrc: string;
  fillColor?: string;
  className?: string;
  /**
   * Portrait width as a fraction of this canvas width. Must match
   * `portraitWidthRatio(shape)` so the photo sits on the white fill exactly.
   */
  portraitWidthRatio?: number;
  /**
   * Base width to draw at, in the same units the portrait uses.
   *
   * The white layer has to be bigger than the portrait or there is no margin to
   * see — the two canvases are both laid out from this number, so drawing them
   * at the same one hides the border behind the photograph exactly.
   */
  size?: number;
}

/**
 * MaskedBackground component that renders a background shape behind content.
 * The shape is filled with a solid color (default white) on a transparent background.
 * This works with PDF generation since it uses Canvas API.
 */
export function MaskedBackground({
  children,
  shapeSrc,
  fillColor = "#ffffff",
  className = "",
  portraitWidthRatio = 1,
  size = 280,
}: MaskedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderBackgroundShape({
      canvas,
      shapeSrc,
      fillColor,
      scale: 1,
      size,
    }).catch((error) => {
      console.error("Failed to render background shape:", error);
    });
  }, [shapeSrc, fillColor, size]);

  return (
    <div className={`relative ${className}`}>
      {/* Background shape canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          maxWidth: "100%",
          height: "auto",
        }}
        aria-hidden="true"
      />
      
      {/* Content layered on top, sized to the inner fill area of the shape */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: `${portraitWidthRatio * 100}%`,
            pointerEvents: "auto",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

