import type { APIRoute } from 'astro';
import { getSiteById, saveSiteContent, deleteSite, SiteError } from '../../../lib/sites';
import { readBody, jsonError, jsonOk } from '../../../lib/request';

/**
 * PUT  /api/sites/:id   Body (JSON): { content } — saves the markdown.
 * DELETE /api/sites/:id — deletes the site (document + storage file).
 *
 * Both verify that the site belongs to the logged-in user.
 */

const forbidden = (): Response =>
  jsonError('Site not found.', 404, 'not_found');

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) {
    return jsonError('Not authenticated.', 401);
  }

  const siteId = params.id;
  if (!siteId) {
    return jsonError('Missing site id.', 400);
  }

  const site = await getSiteById(siteId);
  if (!site || site.userId !== user.$id) {
    return forbidden();
  }

  const body = await readBody(request);
  const content = body.content;
  if (typeof content !== 'string') {
    return jsonError('Missing markdown content.', 400, 'missing_content');
  }

  try {
    const updated = await saveSiteContent(site, content);
    return jsonOk({
      site: { slug: updated.slug, title: updated.title, updatedAt: updated.updatedAt },
    });
  } catch (err) {
    if (err instanceof SiteError) {
      return jsonError(err.message, err.status, err.code);
    }
    return jsonError('Could not save the site.', 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) {
    return jsonError('Not authenticated.', 401);
  }

  const siteId = params.id;
  if (!siteId) {
    return jsonError('Missing site id.', 400);
  }

  const site = await getSiteById(siteId);
  if (!site || site.userId !== user.$id) {
    return forbidden();
  }

  try {
    await deleteSite(site);
    return jsonOk({ deleted: site.slug });
  } catch {
    return jsonError('Could not delete the site.', 500);
  }
};
