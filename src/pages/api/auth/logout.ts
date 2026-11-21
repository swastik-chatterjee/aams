import type { APIRoute } from 'astro';
import { deleteCurrentSession } from '../../../lib/auth';
import { SESSION_COOKIE } from '../../../lib/config';

/**
 * POST /api/auth/logout
 * Deletes the Appwrite session and clears the cookie. Works with or
 * without an active session.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const secret = cookies.get(SESSION_COOKIE)?.value;
  if (secret) {
    await deleteCurrentSession(secret);
    cookies.delete(SESSION_COOKIE, { path: '/' });
  }

  const accept = request.headers.get('accept') ?? '';
  if ((request.headers.get('content-type') ?? '').includes('application/json') || accept.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return redirect('/', 303);
};
