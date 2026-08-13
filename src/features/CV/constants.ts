// A4 dimensions at 96 DPI
export const A4_DIMENSIONS = {
  width: 794, // 210mm at 96 DPI
  height: 1123, // 297mm at 96 DPI
  padding: 12, // 12mm padding on each side
} as const;

// Extra top spacer rendered on pages after the first (see A4Page)
export const A4_PAGE_TOP_SPACER_HEIGHT = 16; // must match Spacer.tsx SPACER_SIZES.md

// Calculated content height (page height minus padding)
export const A4_CONTENT_HEIGHT =
  A4_DIMENSIONS.height - A4_DIMENSIONS.padding * 2;

// Spacing constants (must match Spacer.tsx SPACER_SIZES and PaginatedRenderer logic)
export const PAGINATION_SPACING = {
  beforeSectionHeader: 24,   // lg
  afterSectionHeader: 12,    // sm
  betweenItems: 16,          // md
  betweenSections: 24,       // lg
} as const;
