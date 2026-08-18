import React from "react";

// Item identification and measurement
export interface CVItemMeasurement {
  id: string;
  height: number;
  component: React.ReactNode;
  order: number; // DOM order index for deterministic sorting
  metadata: {
    section: string;
    isSectionHeader?: boolean;
    repeatOnNewPage?: boolean;
    canSplit: boolean;
  };
}

// Pagination calculation result
export interface PageBreak {
  pageNumber: number;
  itemIds: string[];
  totalHeight: number;
}

// Measurement context
export interface MeasurementContextValue {
  registerItem: (id: string, measurement: Omit<CVItemMeasurement, "id">) => void;
  unregisterItem: (id: string) => void;
  getItem: (id: string) => CVItemMeasurement | undefined;
  getAllItems: () => CVItemMeasurement[];
  getMeasurementStatus: () => MeasurementStatus;
}

export type MeasurementStatus = "idle" | "measuring" | "complete";

// Layout configuration
export interface CVLayoutConfig {
  pageHeight: number;
  pageWidth: number;
  pagePadding: number;
}

// Component props
export interface MeasuredItemProps {
  id: string;
  section: string;
  canSplit?: boolean;
  children: React.ReactNode;
  className?: string;
  order?: number;
}

export interface MeasuredSectionProps {
  id: string;
  title?: string;
  repeatHeaderOnNewPage?: boolean;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  order?: number;
}

export interface A4PageProps {
  pageNumber: number;
  children: React.ReactNode;
  totalPages: number;
  className?: string;
}

export interface CVLayoutProps {
  children: React.ReactNode;
  onMeasurementComplete?: (pageBreaks: PageBreak[]) => void;
  /** Explicit boundary used by the secondary designed-PDF capture. */
  previewId?: string;
}
