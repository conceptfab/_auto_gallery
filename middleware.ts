import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_EMAIL } from './src/config/constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Basic check for admin session cookies
  // Note: This matches logic in src/utils/auth.ts but runs on Edge
  const adminEmailCookie = request.cookies.get('admin_email');
  const adminLoggedCookie = request.cookies.get('admin_logged');

  // Cookie może być podpisane (email.hmac) — wyciągnij email sprzed ostatniej kropki
  let adminEmailValue = adminEmailCookie?.value ?? '';
  if (adminEmailValue.includes('@')) {
    // Podpisane cookie: email@domain.com.hexsignature — odetnij podpis
    const lastDot = adminEmailValue.lastIndexOf('.');
    const possibleEmail = adminEmailValue.slice(0, lastDot);
    // Jeśli część przed ostatnią kropką zawiera @, to jest to podpisane cookie
    if (possibleEmail.includes('@')) {
      adminEmailValue = possibleEmail;
    }
  }

  const isAdmin =
    adminLoggedCookie?.value === 'true' &&
    adminEmailValue.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();

  // Allow public access to login endpoints
  if (
    pathname === '/api/auth/admin/request-access' ||
    pathname === '/api/auth/admin/verify-code' ||
    pathname === '/api/auth/admin/logout' ||
    pathname === '/api/auth/admin/status'
  ) {
    return NextResponse.next();
  }

  // GET ustawień jest publiczne (highlightKeywords, thumbnailAnimationDelay dla galerii)
  if (pathname === '/api/admin/settings' && request.method === 'GET') {
    return NextResponse.next();
  }

  if (!isAdmin) {
    // If API request, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 401 }
      );
    }

    // If Page request, redirect to login
    const loginUrl = new URL('/admin-login', request.url);
    // Optional: Add returnTo query param
    // loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin',
    '/api/admin/:path*',
    '/api/auth/admin/:path*',
  ],
};
