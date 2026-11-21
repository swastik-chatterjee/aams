import type { APIRoute } from 'astro';
import { createProfile, SiteError } from '../../lib/sites';
import { readBody, wantsJson, jsonError, jsonOk } from '../../lib/request';

/**
 * POST /api/profile
 * Body (form or JSON): { username }
 *
 * One-time onboarding: claims the username that anchors all of the user's
 * site URLs (/{username}/{sitename}).
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) {
    return jsonError('Not authenticated.', 401);
  }

  const asJson = wantsJson(request);
  const body = await readBody(request);
  const username = (body.username ?? '').trim().toLowerCase();

  try {
    const profile = await createProfile(user.$id, username);
    if (asJson) return jsonOk({ username: profile.username });
    return redirect('/dashboard', 303);
  } catch (err) {
    if (err instanceof SiteError) {
      if (asJson) return jsonError(err.message, err.status, err.code);
      return redirect(`/dashboard?error=${encodeURIComponent(err.code)}&username=${encodeURIComponent(username)}`, 303);
    }
    if (asJson) return jsonError('Could not save username.', 500);
    return redirect('/dashboard?error=profile_failed', 303);
  }
};
