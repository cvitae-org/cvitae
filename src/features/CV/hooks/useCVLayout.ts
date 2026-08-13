"use client";

import { useMemo } from "react";
import { useMeasurementContext } from "../contexts/MeasurementContext";
import { calculatePageBreaks } from "../utils/calculatePageBreaks";
import { A4_CONTENT_HEIGHT } from "../constants";
import type { PageBreak } from "../types";

interface UseCVLayoutOptions {
  pageHeight?: number;
}

interface UseCVLayoutReturn {
  pageBreaks: PageBreak[];
  isReady: boolean;
  itemCount: number;
  status: "idle" | "measuring" | "complete";
}

/**
 * Hook to manage CV layout state and calculations.
 * Tracks measurement status and calculates page breaks for paginated A4 layout.
 */
export function useCVLayout({
  pageHeight = A4_CONTENT_HEIGHT,
}: UseCVLayoutOptions = {}): UseCVLayoutReturn {
  const measurementContext = useMeasurementContext();
  const status = measurementContext.getMeasurementStatus();
  const items = measurementContext.getAllItems();

  // Calculate page breaks when measurements are complete
  const pageBreaks = useMemo(() => {
    if (status === "complete" && items.length > 0) {
      return calculatePageBreaks(items, pageHeight);
    }
    return [];
  }, [status, items, pageHeight]);

  const isReady = status === "complete" && items.length > 0;

  return {
    pageBreaks,
    isReady,
    itemCount: items.length,
    status,
  };
}

