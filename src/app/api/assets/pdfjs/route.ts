import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-static';

/** Browser-loadable PDF.js module used by diagnostics and visual regression. */
export async function GET() {
  try {
    const source = await readFile(
      path.join(
        process.cwd(),
        'node_modules',
        'pdfjs-dist',
        'legacy',
        'build',
        'pdf.mjs'
      )
    );
    return new Response(source, {
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('Could not load the bundled PDF.js module.', error);
    return new Response('PDF.js unavailable', { status: 500 });
  }
}
