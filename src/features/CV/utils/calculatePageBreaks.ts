import { A4_PAGE_TOP_SPACER_HEIGHT } from "..";
import type { CVItemMeasurement, PageBreak } from "../types";
import { getOriginalItemId, getSpacingBeforeItem } from "./paginationSpacing";

/**
 * Pure function that calculates page breaks based on item measurements.
 * 
 * Algorithm:
 * 1. Iterate through items in order
 * 2. Track current page height
 * 3. When item doesn't fit:
 *    - Check if it's a section header with repeatOnNewPage
 *    - Start new page
 *    - Add header to new page if needed
 * 4. Handle edge cases:
 *    - Item taller than page (warning, render anyway)
 *    - Empty pages
 *    - Section continuations
 */

export function calculatePageBreaks(
  items: CVItemMeasurement[],
  pageHeight: number
): PageBreak[] {
  if (items.length === 0) {
    return [];
  }

  const createNewPage = (pageNumber: number): PageBreak => ({
    pageNumber,
    itemIds: [],
    // A4Page renders an extra top spacer on pages after the first.
    // Reserve its height here so the pagination budget matches runtime layout.
    totalHeight: pageNumber > 1 ? A4_PAGE_TOP_SPACER_HEIGHT : 0,
  });

  const pages: PageBreak[] = [];
  let currentPage: PageBreak = createNewPage(1);
  let prevPlacedItem: CVItemMeasurement | null = null;

  // Track the last section header for potential repetition
  let lastSectionHeader: CVItemMeasurement | null = null;
  let currentSection: string | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const isFirstOnPage = currentPage.itemIds.length === 0;
    const spacingBefore = getSpacingBeforeItem({
      prevItem: prevPlacedItem,
      item,
      isFirstOnPage,
    });

    const itemHeight = item.height;
    const totalItemHeight = itemHeight + spacingBefore;

    // Track section headers
    if (item.metadata.isSectionHeader) {
      lastSectionHeader = item;
      currentSection = item.metadata.section;
    }

    // Check if item fits on current page (including spacing)
    const willFit = currentPage.totalHeight + totalItemHeight <= pageHeight;

    // Avoid "orphan" section headers (header at page bottom with no content under it)
    // If header fits but the next item from the same section wouldn't, move header to next page too.
    if (willFit && item.metadata.isSectionHeader) {
      const nextItem = items[i + 1];
      const hasNextContentInSameSection =
        !!nextItem &&
        !nextItem.metadata.isSectionHeader &&
        nextItem.metadata.section === item.metadata.section;

      if (hasNextContentInSameSection && currentPage.itemIds.length > 0) {
        const spacingBeforeNext = getSpacingBeforeItem({
          prevItem: item,
          item: nextItem,
          isFirstOnPage: false,
        });

        const combinedHeightIfKept =
          currentPage.totalHeight + totalItemHeight + spacingBeforeNext + nextItem.height;

        if (combinedHeightIfKept > pageHeight) {
          pages.push(currentPage);
          currentPage = createNewPage(pages.length + 1);
          prevPlacedItem = null;

          // Header becomes first item on the new page (no spacing before)
          currentPage.itemIds.push(item.id);
          currentPage.totalHeight += itemHeight;
          prevPlacedItem = item;
          continue;
        }
      }
    }

    if (willFit) {
      // Item fits, add to current page (with spacing)
      currentPage.itemIds.push(item.id);
      currentPage.totalHeight += totalItemHeight;
      prevPlacedItem = item;
    } else {
      // Item doesn't fit
      
      // Save current page if it has items
      if (currentPage.itemIds.length > 0) {
        pages.push(currentPage);
      }

      // Start new page
      currentPage = createNewPage(pages.length + 1);
      prevPlacedItem = null;

      // Check if we should repeat the section header
      if (
        lastSectionHeader &&
        lastSectionHeader.metadata.repeatOnNewPage &&
        lastSectionHeader.metadata.section === currentSection &&
        !item.metadata.isSectionHeader // Don't repeat if this item IS the header
      ) {
        const repeatedHeaderId = `${lastSectionHeader.id}-repeat-p${currentPage.pageNumber}`;

        // Only repeat if it doesn't make the current item overflow more than necessary.
        // Spacing after the header is accounted for by the regular spacingBefore logic
        // when we place the first real item below it.
        const spacingBeforeFirstItemAfterRepeat = getSpacingBeforeItem({
          prevItem: lastSectionHeader,
          item,
          isFirstOnPage: false,
        });

        const wouldFitWithRepeat =
          currentPage.totalHeight +
          lastSectionHeader.height +
          spacingBeforeFirstItemAfterRepeat +
          item.height <=
          pageHeight;

        if (wouldFitWithRepeat) {
          // Create unique ID for repeated header by appending page number
          // This prevents duplicate React keys
          currentPage.itemIds.push(repeatedHeaderId);
          currentPage.totalHeight += lastSectionHeader.height;
          prevPlacedItem = lastSectionHeader;
        }
      }

      // Add the item that didn't fit to the new page (spacing depends on whether we repeated a header)
      const spacingBeforeOnNewPage = getSpacingBeforeItem({
        prevItem: prevPlacedItem,
        item,
        isFirstOnPage: currentPage.itemIds.length === 0,
      });

      currentPage.itemIds.push(item.id);
      currentPage.totalHeight += spacingBeforeOnNewPage + itemHeight;
      prevPlacedItem = item;

      // Warn if item is taller than page height
      if (itemHeight > pageHeight) {
        console.warn(
          `Item ${item.id} (height: ${itemHeight}px) exceeds page height (${pageHeight}px). It will overflow.`
        );
      }
    }
  }

  // Add the last page if it has items
  if (currentPage.itemIds.length > 0) {
    pages.push(currentPage);
  }

  // Handle empty result
  if (pages.length === 0) {
    return [
      {
        pageNumber: 1,
        itemIds: [],
        totalHeight: 0,
      },
    ];
  }

  return pages;
}

/**
 * Get items for a specific page
 */
export function getItemsForPage(
  pageBreak: PageBreak,
  itemsMap: Map<string, CVItemMeasurement>
): CVItemMeasurement[] {
  return pageBreak.itemIds
    .map((id) => itemsMap.get(getOriginalItemId(id)))
    .filter((item): item is CVItemMeasurement => item !== undefined);
}

