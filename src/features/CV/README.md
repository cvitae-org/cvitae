# CV Feature - Phase 1 Implementation

## Architecture Overview

This is a complete redesign of Phase 1 with a proper React-based architecture that supports both continuous scroll display and paginated PDF generation.

### Key Design Principles

1. **Pure React** - No DOM cloning, works seamlessly with React's virtual DOM
2. **Separation of Concerns** - Clear separation between measurement, calculation, and rendering
3. **Dual Rendering Modes** - Supports both continuous scroll and paginated A4 layout
4. **Type Safety** - Full TypeScript coverage
5. **Testable** - Pure functions and modular components

## Architecture Layers

### Layer 1: Content Definition

Components that define CV content without layout concerns:
- `MeasuredItem` - Wraps individual content items (e.g., a job experience)
- `MeasuredSection` - Groups related items with optional headers

### Layer 2: Measurement & Coordination

Central system for collecting and managing measurements:
- `MeasurementContext` - Registry that stores all item measurements
- `calculatePageBreaks()` - Pure function that determines page breaks

### Layer 3: Rendering Modes

Two rendering strategies for the same content:
- `ContinuousRenderer` - Single scrollable container
- `PaginatedRenderer` - Content split across A4 pages

## File Structure

```
src/features/CV/
├── types.ts                        # TypeScript type definitions
├── constants.ts                    # A4 dimensions and spacing
├── contexts/
│   └── MeasurementContext.tsx      # Central measurement registry
├── utils/
│   └── calculatePageBreaks.ts      # Pure pagination algorithm
├── components/
│   ├── layout/
│   │   ├── A4Page.tsx             # A4 page presentation
│   │   ├── MeasuredItem.tsx       # Auto-measuring item wrapper
│   │   └── MeasuredSection.tsx    # Section with header support
│   ├── renderers/
│   │   ├── ContinuousRenderer.tsx # Continuous scroll renderer
│   │   └── PaginatedRenderer.tsx  # Paginated A4 renderer
│   ├── CVLayout.tsx               # Main orchestrator
│   └── CVDemo.tsx                 # Demo with mode toggle
├── hooks/
│   └── useCVLayout.ts             # Layout state management
├── CV.tsx                         # Public API component
└── index.ts                       # Exports
```

## Usage Example

```tsx
import { CVLayout, MeasuredSection, MeasuredItem } from '@/features/CV';

function MyCV() {
  return (
    <CVLayout mode="continuous">
      <MeasuredSection id="contact" title="Contact">
        <MeasuredItem id="contact-1" section="contact">
          <div>
            <p>John Doe</p>
            <p>john@example.com</p>
          </div>
        </MeasuredItem>
      </MeasuredSection>

      <MeasuredSection 
        id="experience" 
        title="Experience"
        repeatHeaderOnNewPage={true}
      >
        <MeasuredItem id="job-1" section="experience">
          <div>
            <h3>Senior Developer</h3>
            <p>Tech Corp</p>
            <p>2020 - Present</p>
          </div>
        </MeasuredItem>
      </MeasuredSection>
    </CVLayout>
  );
}
```

## How It Works

### Two-Phase Rendering

1. **Measurement Phase**
   - Children render in hidden container
   - Each `MeasuredItem` measures itself and registers with context
   - `MeasuredSection` headers are also measured

2. **Layout Phase**
   - Once all measurements complete, `calculatePageBreaks()` runs
   - Content is re-rendered in appropriate mode (continuous or paginated)
   - Items are positioned based on calculated page breaks

### Pagination Algorithm

The `calculatePageBreaks()` function:
1. Iterates through items in order
2. Tracks current page height
3. When an item doesn't fit, starts a new page
4. Optionally repeats section headers on new pages
5. Returns array of page assignments

### Mode Switching

- **Continuous Mode**: All items render in a single scrollable container
- **Paginated Mode**: Items distributed across A4Page components based on calculated breaks

## Key Features

- ✅ **No DOM Cloning** - Pure React component rendering
- ✅ **Automatic Pagination** - Smart content splitting across pages
- ✅ **Section Headers** - Can repeat on page breaks
- ✅ **Non-Splittable Items** - Items stay together as atomic units
- ✅ **Type Safe** - Full TypeScript support
- ✅ **Responsive Measurement** - Uses ResizeObserver for dynamic content
- ✅ **Dual Rendering Modes** - Easy mode switching

## Testing the Implementation

Visit `/` (or `/pl`) to see the demo with:
- Mode toggle (Continuous ↔ Paginated)
- Sample CV content
- Both rendering modes working

## Next Steps (Phase 2 & 3)

1. **Phase 2**: Build actual CV sections with real data from translations
2. **Phase 3**: Implement PDF generation using html2canvas + jsPDF

## Benefits of This Architecture

1. **Maintainable** - Clear separation of concerns
2. **Extensible** - Easy to add new section types
3. **Testable** - Pure functions can be unit tested
4. **Performant** - Measurements cached, calculations memoized
5. **React-Native** - Works with React's paradigms, not against them

