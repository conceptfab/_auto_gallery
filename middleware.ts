import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_EMAIL } from './src/config/constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Basic check for admin session cookies
  // Note: This matches logic in src/utils/auth.ts but runs on Edge
  const adminEmailCookie = request.cookies.get('admin_email');
  const adminLoggedCookie = request.cookies.get('admin_logged');

  const isAdmin =
    adminLoggedCookie?.value === 'true' &&
    adminEmailCookie?.value.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();

  // Allow public access to login endpoints
  if (
    pathname === '/api/auth/admin/request-access' ||
    pathname === '/api/auth/admin/verify-code' ||
    pathname === '/api/auth/admin/logout' ||
    pathname === '/api/auth/admin/status'
  ) {
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
