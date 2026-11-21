import type { APIRoute } from 'astro';
import { renderMarkdown } from '../../lib/markdown';
import { jsonError, jsonOk } from '../../lib/request';

/**
 * POST /api/preview
 * Body (JSON): { markdown }
 *
 * Renders markdown through the exact same pipeline used for published
 * pages, so the editor's live preview is WYSIWYG. Requires a session
 * (enforced by middleware). Response: { ok, html, title, description }.
 */
export const POST: APIRoute = async ({ request }) => {
  let markdown = '';
  try {
    const json: unknown = await request.json();
    if (json && typeof json === 'object' && typeof (json as Record<string, unknown>).markdown === 'string') {
      markdown = ((json as Record<string, unknown>).markdown as string).slice(0, 1_000_000);
    }
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  if (!markdown) {
    return jsonError('Missing markdown.', 400, 'missing_markdown');
  }

  try {
    const rendered = renderMarkdown(markdown);
    return jsonOk({
      html: rendered.html,
      title: rendered.title ?? null,
      description: rendered.description ?? null,
    });
  } catch {
    return jsonError('Could not render the markdown.', 500);
  }
};
