import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import {
  addTextLayer,
  TEXT_LAYER_FONT,
  type TextLine
} from './pdfTextLayer';

describe('designed PDF searchable text layer', () => {
  it('keeps tracked heading words intact after PDF.js extraction', async () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const font = readFileSync(
      path.resolve(process.cwd(), 'public/fonts/DejaVuSans.ttf')
    ).toString('base64');
    pdf.addFileToVFS('DejaVuSans.ttf', font);
    pdf.addFont('DejaVuSans.ttf', TEXT_LAYER_FONT, 'normal');

    const lines: TextLine[] = [
      {
        text: 'PROFESSIONAL SUMMARY',
        left: 32,
        width: 420,
        baseline: 90,
        fontSize: 18,
        recoveryOptional: false
      },
      {
        text: 'OTHER TECHNOLOGIES',
        left: 32,
        width: 360,
        baseline: 125,
        fontSize: 12,
        recoveryOptional: false
      },
      {
        text: 'DOŚWIADCZENIE ZAWODOWE',
        left: 32,
        width: 440,
        baseline: 160,
        fontSize: 18,
        recoveryOptional: false
      }
    ];

    addTextLayer(pdf, lines, (pixels) => (pixels * 210) / 794, TEXT_LAYER_FONT);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false
    }).promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const extracted = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    await document.destroy();

    expect(extracted).toContain('PROFESSIONAL SUMMARY');
    expect(extracted).toContain('OTHER TECHNOLOGIES');
    expect(extracted).toContain('DOŚWIADCZENIE ZAWODOWE');
  });
});
