"use client";

import React from "react";
import clsx from "clsx";
import { A4_DIMENSIONS, A4_PAGE_TOP_SPACER_HEIGHT } from "../../constants";
import type { A4PageProps } from "../../types";
import { Spacer } from "./Spacer";

/**
 * A4 Page component - pure presentation, no pagination logic.
 * Provides fixed dimensions, padding, and visual styling.
 */
export function A4Page({
  pageNumber,
  children,
  totalPages,
  className,
}: A4PageProps) {
  return (
    <div
      className={clsx(
        "relative bg-white shadow-lg mx-auto overflow-hidden rounded-md print:rounded-none",
        "print:shadow-none print:m-0",
        className
      )}
      style={{
        width: `${A4_DIMENSIONS.width}px`,
        height: `${A4_DIMENSIONS.height}px`, // Fixed height, not minHeight
      }}
      data-page={pageNumber}
      data-total-pages={totalPages}
    >
      {/* Video Background - only visible on screen, not in print */}
      <div className="absolute inset-0 print:hidden" style={{ zIndex: 0 }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{
            opacity: 1, // Reduce opacity for better text readability
          }}
        >
          <source src="/cv_background.mp4" type="video/mp4" />
        </video>
        {/* White overlay for better text contrast */}
        <div className="absolute inset-0 bg-white/10 backdrop-blur-lg" />
      </div>

      {/* Semi-transparent white background for screen only */}
      <div
        className="absolute inset-0 bg-white/10 print:hidden"
        style={{ zIndex: 0 }}
      />

      {/* Content area with padding */}
      <div
        className="relative flex flex-col"
        style={{
          padding: `${A4_DIMENSIONS.padding}px`,
          width: `${A4_DIMENSIONS.width}px`,
          height: `${A4_DIMENSIONS.height}px`,
          boxSizing: "border-box",
          zIndex: 1,
        }}
      >
        {/* Add small white spacer at the top for pages after the first */}
        {pageNumber > 1 && (
          <Spacer
            height={A4_PAGE_TOP_SPACER_HEIGHT}
            className="bg-white rounded-t-md print:rounded-none"
          />
        )}

        {/* Main page content */}
        {children}

        {/* Deterministic bottom fill (no measurement / no timing race with html2canvas) */}
        <div
          className="flex-1 bg-white rounded-b-md print:rounded-none"
          aria-hidden="true"
          data-page-bottom-fill
        />
      </div>
    </div>
  );
}
