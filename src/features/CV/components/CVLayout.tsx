"use client";

import React, { useState, useEffect } from "react";
import { MeasurementProvider, useMeasurementContext } from "../contexts/MeasurementContext";
import { OrderProvider } from "../contexts/OrderContext";
import { calculatePageBreaks } from "../utils/calculatePageBreaks";
import { PaginatedRenderer } from "./renderers/PaginatedRenderer";
import { A4_CONTENT_HEIGHT, A4_DIMENSIONS } from "../constants";
import type { CVLayoutProps, PageBreak, CVItemMeasurement } from "../types";

/**
 * Loading skeleton that maintains the CV's dimensions during measurement phase.
 * Prevents layout shift when CV loads.
 */
function CVLoadingSkeleton() {
  return (
    <div 
      className="cv-loading-skeleton space-y-8 animate-pulse"
      style={{ width: `${A4_DIMENSIONS.width}px` }}
    >
      {/* First page skeleton */}
      <div
        className="bg-white shadow-lg rounded-sm overflow-hidden"
        style={{
          width: `${A4_DIMENSIONS.width}px`,
          height: `${A4_DIMENSIONS.height}px`,
          padding: `${A4_DIMENSIONS.padding}px`,
        }}
      >
        {/* Header skeleton */}
        <div className="flex gap-4 mb-6">
          <div className="w-24 h-24 bg-gray-200 rounded-sm" />
          <div className="flex-1 space-y-3">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
        
        {/* Summary skeleton */}
        <div className="space-y-2 mb-6">
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-4/5" />
        </div>
        
        {/* Section skeleton */}
        <div className="space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="space-y-3 mt-4">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
      
      {/* Second page skeleton (lighter) */}
      <div
        className="bg-white shadow-lg rounded-sm overflow-hidden opacity-60"
        style={{
          width: `${A4_DIMENSIONS.width}px`,
          height: `${A4_DIMENSIONS.height}px`,
          padding: `${A4_DIMENSIONS.padding}px`,
        }}
      >
        <div className="space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Internal component that orchestrates the layout rendering.
 * This component has access to the MeasurementContext.
 */
function CVLayoutInternal({
  children,
  onMeasurementComplete,
  previewId = 'cv-preview',
}: CVLayoutProps) {
  const measurementContext = useMeasurementContext();
  const [pageBreaks, setPageBreaks] = useState<PageBreak[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  
  // Cache items map to avoid recreating on every render
  const [itemsMap, setItemsMap] = useState<Map<string, CVItemMeasurement>>(
    new Map()
  );

  const status = measurementContext.getMeasurementStatus();
  const isLoading = status !== "complete" || !isCalculated;

  // Recalculated whenever the measurements change, not only the first time.
  //
  // The `!isCalculated` guard that used to be here made pagination a one-shot
  // computation, which was correct while the CV was static and is wrong now it
  // can be edited: adding a job would never find a page to live on. It is safe
  // to re-run because `measurementContext` only changes identity when an item
  // actually re-registers, and `MeasuredItem` re-registers only when its
  // rendered height or text changed — so an unchanged render settles here
  // rather than looping.
  useEffect(() => {
    if (status !== "complete") return;

    const items = measurementContext.getAllItems();
    if (items.length === 0) return;

    const breaks = calculatePageBreaks(items, A4_CONTENT_HEIGHT);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageBreaks(breaks);
    setItemsMap(new Map(items.map((item) => [item.id, item])));

    if (!isCalculated) {
      setIsCalculated(true);
      // Only on the first pass. This is what reveals the document; firing it on
      // every keystroke would restart whatever the caller does with it.
      onMeasurementComplete?.(breaks);
    }
  }, [status, isCalculated, measurementContext, onMeasurementComplete]);

  return (
    <>
      {/*
        The measurement container, now mounted for the whole life of the page
        rather than only until the first pagination.

        It used to be unmounted once measuring finished, which made the visible
        CV a snapshot of the first render — the sections stopped existing, so
        nothing could re-render and no edit could reach the page. Keeping it
        mounted is what makes the document live: these are the components that
        subscribe to the store, and each re-registers its subtree when its
        content changes, which is what `PaginatedRenderer` then draws.

        It stays hidden, off-screen and non-interactive, so the only copy a
        person can reach is the paginated one.
      */}
      <div
        data-cv-container
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        {/* Ensure measurement happens at the same width/padding as the real A4 page.
            Otherwise text wraps differently and measured heights are wrong. */}
        <div
          style={{
            width: `${A4_DIMENSIONS.width}px`,
            padding: `${A4_DIMENSIONS.padding}px`,
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </div>

      <div data-cv-preview-root={previewId}>
        {isLoading ? (
          <CVLoadingSkeleton />
        ) : (
          <PaginatedRenderer pageBreaks={pageBreaks} items={itemsMap} />
        )}
      </div>
    </>
  );
}

/**
 * Main CVLayout component that provides measurement and order contexts
 * and orchestrates the two-phase rendering process.
 * 
 * Phase 1: Render children to measure them (with order tracking)
 * Phase 2: Re-render with paginated A4 layout
 */
export function CVLayout(props: CVLayoutProps) {
  return (
    <MeasurementProvider>
      <OrderProvider>
        <CVLayoutInternal {...props} />
      </OrderProvider>
    </MeasurementProvider>
  );
}
