import { readFile } from 'node:fs/promises';
import path from 'node:path';

const files = {
  regular: 'dejavu-sans-latin-400-normal.woff',
  bold: 'dejavu-sans-latin-700-normal.woff',
  italic: 'dejavu-sans-latin-400-italic.woff',
  'bold-italic': 'dejavu-sans-latin-700-italic.woff'
} as const;

export const dynamic = 'force-static';

export async function GET(
  _request: Request,
  context: { params: Promise<{ face: string }> }
) {
  const { face } = await context.params;
  if (!(face in files)) return new Response('Not found', { status: 404 });

  const filename = files[face as keyof typeof files];
  const fontPath = path.join(
    process.cwd(),
    'node_modules',
    '@fontsource',
    'dejavu-sans',
    'files',
    filename
  );

  try {
    const font = await readFile(fontPath);
    return new Response(font, {
      headers: {
        'Content-Type': 'font/woff',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error(`Could not load bundled DejaVu face "${face}".`, error);
    return new Response('Font asset unavailable', { status: 500 });
  }
}
