import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import sanitizeHtml from 'sanitize-html';
import matter from 'gray-matter';

/**
 * The single markdown pipeline used everywhere — published pages and the
 * editor's live preview both call `renderMarkdown`, so what you preview is
 * exactly what ships.
 *
 * Pipeline: front-matter (gray-matter) → markdown-it (+ highlight.js for
 * code blocks) → sanitize-html (allowlist sanitizer, defense against XSS).
 */

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        // fall through to default escaping
      }
    }
    return ''; // empty string lets markdown-it escape the code itself
  },
});

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'em', 'strong', 'del', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'img', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'sup', 'sub', 'mark',
];

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      // highlight.js emits classes like "hljs-keyword" on spans inside <pre><code>
      span: ['class'],
      code: ['class'],
      pre: ['class'],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      th: ['align'],
      td: ['align'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // External links open safely in a new tab.
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        if (/^https?:\/\//i.test(href)) {
          return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } };
        }
        return { tagName, attribs };
      },
    },
  });
}

export interface RenderedMarkdown {
  html: string;
  title?: string;
  description?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const parsed = matter(source);
  const html = sanitize(md.render(parsed.content));
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  return {
    html,
    title: asString(data.title),
    description: asString(data.description),
  };
}

/** The markdown a new site starts its life with. */
export function buildStarterMarkdown(name: string): string {
  const safeName = name.replace(/"/g, "'");
  return [
    '---',
    `title: "${safeName}"`,
    'description: "A fresh site, ready for words."',
    '---',
    '',
    `# ${safeName}`,
    '',
    'Welcome to your new site. Everything you write here is stored as a single',
    'markdown file in your Appwrite Storage bucket.',
    '',
    '## What you can do',
    '',
    '- Write **markdown** with `code`, lists, quotes…',
    '- Set your page `title` and `description` in the front-matter above',
    '- Hit **Save** — your site is live immediately',
    '',
    '```ts',
    'const site = {',
    '  url: "/username/sitename",',
    '  storage: "appwrite.storage",',
    '  theme: "dracula",',
    '};',
    '```',
    '',
    '> Delete this starter content and make it yours.',
    '',
  ].join('\n');
}
