import { defineMiddleware } from 'astro:middleware';
import { config, SESSION_COOKIE } from './lib/config';
import { getSessionUser } from './lib/auth';

/**
 * Session middleware.
 *
 * - Reads the session cookie, validates it against Appwrite, and exposes
 *   `locals.user`.
 * - Guards the dashboard and the authenticated API endpoints.
 * - Lightweight CSRF protection: state-changing API calls may only come
 *   from our own origin.
 */

const PROTECTED_PAGES = ['/dashboard', '/settings'];
const PROTECTED_API = ['/api/sites', '/api/profile', '/api/preview'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, request } = context;

  let user = null;
  const sessionSecret = cookies.get(SESSION_COOKIE)?.value;
  if (sessionSecret && config.isConfigured) {
    user = await getSessionUser(sessionSecret);
    if (!user) {
      // stale/invalid cookie — clean it up
      cookies.delete(SESSION_COOKIE, { path: '/' });
    }
  }
  context.locals.user = user;

  const path = url.pathname;
  const method = request.method.toUpperCase();

  // CSRF-lite: block cross-origin mutations to our API.
  if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== url.host) {
          return new Response(JSON.stringify({ error: 'Cross-origin request blocked.' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: 'Cross-origin request blocked.' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
  }

  const needsAuth =
    PROTECTED_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    PROTECTED_API.some((p) => path === p || path.startsWith(`${p}/`));

  if (needsAuth && !user) {
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return context.redirect('/login', 302);
  }

  return next();
});
