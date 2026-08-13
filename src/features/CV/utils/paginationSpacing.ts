import { PAGINATION_SPACING } from "../constants";
import type { CVItemMeasurement } from "../types";

/**
 * Repeated section headers are stored in page breaks with a synthetic id:
 *   `${originalId}-repeat-p${pageNumber}`
 *
 * This helper normalizes such ids back to the original measurement id so
 * consumers can resolve the measurement from the items map.
 */
export function getOriginalItemId(id: string): string {
  const repeatMarker = "-repeat-p";
  const idx = id.indexOf(repeatMarker);
  return idx >= 0 ? id.slice(0, idx) : id;
}

type MaybeItem = CVItemMeasurement | null | undefined;

/**
 * Computes the explicit vertical spacing inserted *before* an item.
 * This must match the runtime rendering behavior exactly, since we budget
 * the same spacing in the pagination algorithm.
 */
export function getSpacingBeforeItem(params: {
  prevItem: MaybeItem;
  item: CVItemMeasurement;
  isFirstOnPage: boolean;
}): number {
  const { prevItem, item, isFirstOnPage } = params;

  if (isFirstOnPage) return 0;

  if (item.metadata.isSectionHeader) {
    return PAGINATION_SPACING.beforeSectionHeader;
  }

  if (prevItem?.metadata.isSectionHeader) {
    return PAGINATION_SPACING.afterSectionHeader;
  }

  if (prevItem && prevItem.metadata.section === item.metadata.section) {
    return PAGINATION_SPACING.betweenItems;
  }

  return PAGINATION_SPACING.betweenSections;
}

