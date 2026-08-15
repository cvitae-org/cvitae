Two kinds of font live here, and only one of them is committed.

## Myriad Pro — the CV's typeface, not in the repo

Add the binaries yourself:

- MyriadPro-Regular.woff2 (and optionally .woff)
- MyriadPro-It.woff2
- MyriadPro-Bold.woff2
- MyriadPro-BoldIt.woff2

Keep the exact filenames above so the @font-face rules in `src/app/globals.css`
resolve correctly. These are licensed and are deliberately not redistributed
here.

## DejaVuSans.ttf — the PDF text layer, committed

Used only by `src/features/CV/utils/pdfTextLayer.ts`, and never drawn. The PDF
export rasterises each page, which used to leave the file with no text in it at
all — nothing selectable, nothing searchable, and nothing an applicant tracking
system could read. The words are now written over the image in an invisible
rendering mode, and that needs a font jsPDF can embed.

It is not Myriad, for two measured reasons. jsPDF reads neither WOFF nor WOFF2,
which is all Myriad ships as here; and jsPDF's built-in fonts are Latin-1, so
Polish came back out of a test export as `Beń → BeD` and
`Zaprojektowałem → ZaprojektowaBem`. DejaVu covers Latin Extended-A and the
dashes the dates use, and a full export now round-trips through the runtime's
PDF reader with every diacritic intact.

Committed rather than fetched at build time because it is a dependency of the
export, and under the Bitstream Vera / DejaVu licence — see
`DejaVuSans-LICENSE.txt` — redistribution and embedding are both permitted.
Fetched lazily by the browser, so a visit that never exports never downloads it.
jsPDF subsets what it embeds: the 739KB file adds roughly 240KB to an exported
CV, not 739.
