"use client";

import React from "react";

interface SpacerProps {
  height: number; // Height in pixels
  className?: string;
}

/**
 * Explicit spacing component for PDF generation.
 * Creates actual DOM element with height that html2canvas can properly capture.
 * 
 * Use this instead of Tailwind margin/spacing utilities (space-y-*) 
 * for spacing that needs to appear in PDFs.
 */
export function Spacer({ height, className = "" }: SpacerProps) {
  return (
    <div
      className={`cv-spacer ${className}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    />
  );
}

// Predefined spacer sizes for consistency
export const SPACER_SIZES = {
  xs: 8,   // 8px
  sm: 12,  // 12px
  md: 16,  // 16px
  lg: 24,  // 24px
  xl: 32,  // 32px
  xxl: 48, // 48px
} as const;

