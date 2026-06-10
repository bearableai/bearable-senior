import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function runs before every request
// We'll use it to ensure the database schema exists
export async function middleware(request: NextRequest) {
  // Trigger schema check on app startup
  // The actual migration runs server-side in API routes
  return NextResponse.next();
}

// Don't run middleware for static files
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
