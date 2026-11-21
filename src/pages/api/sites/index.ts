import type { APIRoute } from 'astro';
import { createSite, getProfile, SiteError } from '../../../lib/sites';
import { readBody, wantsJson, jsonError, jsonOk } from '../../../lib/request';

/**
 * POST /api/sites
 * Body (form or JSON): { name, slug? }
 *
 * Creates a site: one document (routing + metadata) plus one starter
 * markdown file in Appwrite Storage, then sends the user to the editor.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) {
    return jsonError('Not authenticated.', 401);
  }

  const asJson = wantsJson(request);
  const fail = (code: string, status: number, message?: string): Response => {
    if (asJson) return jsonError(message ?? 'Could not create site.', status, code);
    return redirect(`/dashboard?error=${encodeURIComponent(code)}`, 303);
  };

  const profile = await getProfile(user.$id);
  if (!profile) {
    return fail('no_profile', 400, 'Pick a username before creating sites.');
  }

  const body = await readBody(request);
  const name = (body.name ?? '').trim();
  const slug = (body.slug ?? '').trim();

  try {
    const site = await createSite({
      userId: user.$id,
      username: profile.username,
      name,
      rawSlug: slug || name,
    });
    if (asJson) return jsonOk({ site });
    return redirect(`/dashboard/sites/${site.slug}`, 303);
  } catch (err) {
    if (err instanceof SiteError) {
      return fail(err.code, err.status, err.message);
    }
    return fail('create_failed', 500);
  }
};
