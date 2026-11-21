/**
 * Central configuration: reads environment variables once and exposes a
 * validated, typed view of them. The app never crashes on missing config —
 * `isConfigured` lets pages render a friendly setup banner instead.
 */

export const APP_NAME = 'Dracula CMS';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

const appwriteEndpoint = env('APPWRITE_ENDPOINT');
const appwriteProjectId = env('APPWRITE_PROJECT_ID');
const appwriteApiKey = env('APPWRITE_API_KEY');

const missing: string[] = [];
if (!appwriteEndpoint) missing.push('APPWRITE_ENDPOINT');
if (!appwriteProjectId) missing.push('APPWRITE_PROJECT_ID');
if (!appwriteApiKey) missing.push('APPWRITE_API_KEY');

export const config = {
  appName: APP_NAME,
  appwrite: {
    endpoint: appwriteEndpoint ?? '',
    projectId: appwriteProjectId ?? '',
    apiKey: appwriteApiKey ?? '',
  },
  /** Public URL of this app (no trailing slash). Magic links redirect here. */
  siteUrl: (env('SITE_URL') ?? 'http://localhost:3000').replace(/\/+$/, ''),
  ids: {
    database: env('APPWRITE_DATABASE_ID') ?? 'cms',
    sites: env('APPWRITE_SITES_COLLECTION_ID') ?? 'sites',
    profiles: env('APPWRITE_PROFILES_COLLECTION_ID') ?? 'profiles',
    bucket: env('APPWRITE_BUCKET_ID') ?? 'sites',
  },
  isConfigured: missing.length === 0,
  missing,
} as const;

/** Name of the httpOnly cookie holding the Appwrite session secret. */
export const SESSION_COOKIE = 'dracms_session';

/** How long the session cookie lives (30 days). Appwrite still validates it). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Usernames double as the first path segment of published sites
 * (/{username}/{sitename}), so these values are off-limits.
 */
export const RESERVED_USERNAMES = [
  'api', 'auth', 'login', 'logout', 'signup', 'register', 'dashboard',
  'settings', 'admin', 'root', 'static', 'public', 'assets', 'asset',
  'css', 'js', 'img', 'images', 'favicon.ico', 'robots.txt', 'robots',
  '_astro', 'dist', 'build', 'src', 'node_modules', 'app', 'cms', 'www',
  'mail', 'ftp', 'blog', 'docs', 'support', 'help', 'about', 'terms',
  'privacy', 'account', 'profile', 'me', 'new', 'edit', 'delete',
  'create', 'sites', 'site', 'users', 'user', 'verify', 'token',
] as const;

/** Slugs are the second path segment of published sites. */
export const RESERVED_SLUGS = [
  'new', 'edit', 'delete', 'create', 'api', 'index', 'admin', 'edit',
] as const;
