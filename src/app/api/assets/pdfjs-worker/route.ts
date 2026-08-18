import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-static';

export async function GET() {
  try {
    const worker = await readFile(
      path.join(
        process.cwd(),
        'node_modules',
        'pdfjs-dist',
        'legacy',
        'build',
        'pdf.worker.min.mjs'
      )
    );
    return new Response(worker, {
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('Could not load the bundled PDF.js worker.', error);
    return new Response('PDF worker unavailable', { status: 500 });
  }
}
