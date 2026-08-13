import createMiddleware from 'next-intl/middleware';
import { routing } from './libs/i18n/routing';

// Locale negotiation only — the CV is public, there is no access gate.
export default createMiddleware(routing);

export const config = {
  matcher: ['/', '/(pl)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)']
};
