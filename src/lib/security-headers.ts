/** Browser security policy shared by production and preview deployments. */

export function contentSecurityPolicy(host: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function securityHeaders(host: string): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(host),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  };
}
