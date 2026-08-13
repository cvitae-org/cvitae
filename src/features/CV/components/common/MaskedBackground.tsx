"use client";

import React, { useEffect, useRef } from "react";
import { renderBackgroundShape } from "../../utils/canvasBackground";

interface MaskedBackgroundProps {
  children: React.ReactNode;
  shapeSrc: string;
  fillColor?: string;
  className?: string;
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
      size: 280,
    }).catch((error) => {
      console.error("Failed to render background shape:", error);
    });
  }, [shapeSrc, fillColor]);

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
      
      {/* Content layered on top */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

