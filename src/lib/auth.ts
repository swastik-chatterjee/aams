import { ID } from 'node-appwrite';
import type { Models } from 'node-appwrite';
import { getAdminServices, getUserServices } from './appwrite';
import { config } from './config';

/**
 * Magic-link authentication against Appwrite, fully server-side.
 *
 * 1. `requestMagicLink(email)` asks Appwrite to email the user a magic link.
 *    Appwrite Cloud sends this email itself from its own domain via the
 *    built-in default SMTP — no custom SMTP provider is required.
 *    If the email is new, Appwrite automatically creates the account.
 * 2. The link lands on SITE_URL/auth/verify?userId=...&secret=...
 * 3. `createSessionFromToken()` exchanges the token for a session and
 *    returns the session secret, which we store in an httpOnly cookie.
 * 4. Every request, the middleware validates the cookie with
 *    `getSessionUser()`.
 */

export class MagicLinkError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = 'magic_link_failed', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

/** Tiny in-memory throttle so a single visitor can't spam magic-link emails. */
const perEmail = new Map<string, number>();
const perIp = new Map<string, number[]>();
const EMAIL_COOLDOWN_MS = 60_000; // 1 request / email / minute
const IP_MAX = 5; // 5 requests / IP / 10 minutes
const IP_WINDOW_MS = 600_000;

export function throttleCheck(email: string, ip: string): void {
  const now = Date.now();

  const last = perEmail.get(email);
  if (last && now - last < EMAIL_COOLDOWN_MS) {
    throw new MagicLinkError(
      'A login link was already sent to this address. Please wait a minute before requesting another.',
      'throttled',
      429,
    );
  }

  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX) {
    throw new MagicLinkError(
      'Too many login requests from this network. Please try again later.',
      'throttled',
      429,
    );
  }
  hits.push(now);
  perIp.set(ip, hits);

  // opportunistic cleanup
  if (perEmail.size > 500) {
    for (const [key, t] of perEmail) {
      if (now - t > EMAIL_COOLDOWN_MS * 2) perEmail.delete(key);
    }
  }
}

export async function requestMagicLink(email: string): Promise<void> {
  const { account } = getAdminServices();
  try {
    await account.createMagicURLToken({
      userId: ID.unique(),
      email,
      url: `${config.siteUrl}/auth/verify`,
    });
  } catch (err) {
    const e = err as { code?: number; message?: string };
    if (e.code === 429) {
      throw new MagicLinkError(
        'Too many login emails requested. Please wait a moment and try again.',
        'rate_limited',
        429,
      );
    }
    if (e.message?.includes('hostname') || e.message?.toLowerCase().includes('platform')) {
      throw new MagicLinkError(
        'Appwrite rejected the magic link because this app\'s hostname is not registered as a Web Platform in your Appwrite console. See the README (step 3).',
        'platform_missing',
        400,
      );
    }
    throw new MagicLinkError(
      'Could not send the login email. Please double-check your Appwrite configuration.',
      'send_failed',
      502,
    );
  }
}

/** Exchange a magic-link token for a session; returns the session secret. */
export async function createSessionFromToken(
  userId: string,
  secret: string,
): Promise<string> {
  const { account } = getAdminServices();
  try {
    // The response includes `secret` because the request uses an API key.
    const session: Models.Session = await account.createSession({ userId, secret });
    if (!session?.secret) {
      throw new Error('no secret in session response');
    }
    return session.secret;
  } catch {
    throw new MagicLinkError(
      'This login link is invalid, already used, or expired (links live for 1 hour). Request a fresh one below.',
      'invalid_token',
      400,
    );
  }
}

/** Validate a session secret and return the Appwrite user, or null. */
export async function getSessionUser(
  sessionSecret: string,
): Promise<Models.User<Record<string, any>> | null> {
  try {
    const { account } = getUserServices(sessionSecret);
    return await account.get();
  } catch {
    return null;
  }
}

/** Best-effort session deletion (logout). Never throws. */
export async function deleteCurrentSession(sessionSecret: string): Promise<void> {
  try {
    const { account } = getUserServices(sessionSecret);
    await account.deleteSession({ sessionId: 'current' });
  } catch {
    // Session may already be gone — nothing to do.
  }
}
