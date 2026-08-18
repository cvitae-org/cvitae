import { readFile } from 'node:fs/promises';
import process from 'node:process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pdfPath, popplerTextPath] = process.argv.slice(2);
if (!pdfPath || !popplerTextPath) {
  throw new Error('Usage: node scripts/check-poppler-recovery.mjs file.pdf poppler.txt');
}

const tokens = (value) =>
  (
    value
      .normalize('NFC')
      .toLocaleLowerCase()
      .replace(/https?:\/\/\S+/giu, ' ')
      .match(/[\p{L}\p{N}]+(?:[.+#/-][\p{L}\p{N}]+)*/gu) ?? []
  ).filter((token) => token.length > 1 || /\d/.test(token));

const bytes = new Uint8Array(await readFile(pdfPath));
const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
let pdfJsText = '';
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  pdfJsText += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
}
await pdf.destroy();

const expected = tokens(pdfJsText);
const actual = tokens(await readFile(popplerTextPath, 'utf8'));
const available = new Map();
actual.forEach((token) => available.set(token, (available.get(token) ?? 0) + 1));

let recovered = 0;
expected.forEach((token) => {
  const count = available.get(token) ?? 0;
  if (count > 0) {
    recovered += 1;
    available.set(token, count - 1);
  }
});

const ratio = expected.length === 0 ? 0 : recovered / expected.length;
console.log(
  `${pdfPath}: Poppler recovered ${(ratio * 100).toFixed(2)}% of PDF.js meaningful tokens.`
);
if (ratio < 0.995) process.exitCode = 1;
if (actual.length > expected.length * 1.12) {
  console.error(`${pdfPath}: Poppler output suggests duplicate hidden text.`);
  process.exitCode = 1;
}
