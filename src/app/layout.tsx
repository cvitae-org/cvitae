import type { ReactNode } from 'react';

// The real <html>/<body> shell lives in `[locale]/layout.tsx`, which is where the
// resolved locale is available for the `lang` attribute.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
