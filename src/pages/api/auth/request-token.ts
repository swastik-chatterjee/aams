import type { APIRoute } from 'astro';
import { isValidEmail, requestMagicLink, throttleCheck, MagicLinkError } from '../../../lib/auth';
import { config } from '../../../lib/config';
import { readBody, wantsJson, clientIp, jsonError } from '../../../lib/request';

/**
 * POST /api/auth/request-token
 * Body (form or JSON): { email }
 *
 * Asks Appwrite to email the user a magic link. Appwrite Cloud sends the
 * email itself via its default SMTP — no custom mail provider involved.
 */
export const POST: APIRoute = async ({ request, redirect, clientAddress }) => {
  const asJson = wantsJson(request);

  const fail = (code: string, status: number): Response => {
    if (asJson) return jsonError('Request failed.', status, code);
    return redirect(`/login?error=${encodeURIComponent(code)}`, 303);
  };

  const body = await readBody(request);
  const email = (body.email ?? '').trim().toLowerCase();

  if (!isValidEmail(email)) {
    return fail('invalid_email', 400);
  }
  if (!config.isConfigured) {
    return fail('not_configured', 503);
  }

  try {
    throttleCheck(email, clientIp(request, clientAddress ?? '127.0.0.1'));
  } catch (err) {
    if (err instanceof MagicLinkError) {
      return fail(err.code, err.status);
    }
    return fail('throttled', 429);
  }

  try {
    await requestMagicLink(email);
  } catch (err) {
    if (err instanceof MagicLinkError) {
      return fail(err.code, err.status);
    }
    return fail('send_failed', 500);
  }

  if (asJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return redirect(`/login?sent=1&email=${encodeURIComponent(email)}`, 303);
};
