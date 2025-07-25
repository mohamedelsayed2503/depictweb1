import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  getClientIP, 
  checkRateLimit, 
  validateOrigin, 
  validateCSRF, 
  applySecurityHeaders, 
  logSecurityEvent 
} from '@/lib/security';

export function middleware(request: NextRequest) {
  const clientIP = getClientIP(request);
  const pathname = request.nextUrl.pathname;
  
  // Apply security headers to all responses
  let response = NextResponse.next();
  
  // Rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const rateLimit = checkRateLimit(clientIP);
    
    if (!rateLimit.allowed) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', { pathname }, clientIP);
      return new NextResponse('Too Many Requests', { 
        status: 429,
        headers: {
          'Retry-After': '900', // 15 minutes
          'X-RateLimit-Limit': process.env.RATE_LIMIT_MAX_REQUESTS || '100',
          'X-RateLimit-Remaining': '0'
        }
      });
    }
    
    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  }
  
  // Validate origin for API requests
  if (pathname.startsWith('/api/') && !validateOrigin(request)) {
    logSecurityEvent('INVALID_ORIGIN', { 
      pathname, 
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer')
    }, clientIP);
    return new NextResponse('Forbidden', { status: 403 });
  }
  
  // CSRF protection for state-changing requests
  if (pathname.startsWith('/api/') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    if (!validateCSRF(request)) {
      logSecurityEvent('CSRF_VALIDATION_FAILED', { pathname, method: request.method }, clientIP);
      return new NextResponse('CSRF token validation failed', { status: 403 });
    }
  }
  
  // Block suspicious paths
  const suspiciousPaths = [
    '/wp-admin',
    '/admin',
    '/.env',
    '/config',
    '/backup',
    '/phpmyadmin',
    '/.git'
  ];
  
  if (suspiciousPaths.some(path => pathname.startsWith(path))) {
    logSecurityEvent('SUSPICIOUS_PATH_ACCESS', { pathname }, clientIP);
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // Redirect root to home
  if (pathname === '/') {
    response = NextResponse.redirect(new URL('/home/', request.url));
  }
  
  // Apply security headers
  return applySecurityHeaders(response);
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}