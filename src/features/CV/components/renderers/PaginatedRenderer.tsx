"use client";

import React from "react";
import { A4Page } from "../layout/A4Page";
import { Spacer } from "../layout/Spacer";
import type { PageBreak, CVItemMeasurement } from "../../types";
import { getOriginalItemId, getSpacingBeforeItem } from "../../utils/paginationSpacing";

interface PaginatedRendererProps {
  pageBreaks: PageBreak[];
  items: Map<string, CVItemMeasurement>;
  className?: string;
}

/**
 * Renders CV content distributed across A4 pages.
 * Each page contains the items assigned to it by the pagination calculator.
 */
export function PaginatedRenderer({
  pageBreaks,
  items,
  className = "",
}: PaginatedRendererProps) {
  if (pageBreaks.length === 0) {
    return null;
  }

  return (
    <div className={`cv-paginated space-y-8 ${className}`}>
      {pageBreaks.map((page) => (
        <A4Page
          key={page.pageNumber}
          pageNumber={page.pageNumber}
          totalPages={pageBreaks.length}
        >
          {page.itemIds.map((id, itemIndex) => {
            const originalId = getOriginalItemId(id);
            
            const item = items.get(originalId);
            if (!item) {
              console.warn(`Item ${originalId} not found in items map`);
              return null;
            }
            
            const prevId = page.itemIds[itemIndex - 1];
            const prevItem = prevId ? items.get(getOriginalItemId(prevId)) : null;

            const spacingBefore = getSpacingBeforeItem({
              prevItem,
              item,
              isFirstOnPage: itemIndex === 0,
            });
            
            return (
              <React.Fragment key={id}>
                {spacingBefore > 0 && <Spacer height={spacingBefore} className="bg-white" />}
                <div
                  data-item-id={id}
                  data-original-id={originalId}
                >
                  {item.component}
                </div>
              </React.Fragment>
            );
          })}
        </A4Page>
      ))}
    </div>
  );
}

