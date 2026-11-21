import { ID, Permission, Role, Query } from 'node-appwrite';
import type { Models } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import matter from 'gray-matter';
import { getAdminServices } from './appwrite';
import { config, RESERVED_USERNAMES, RESERVED_SLUGS } from './config';
import { buildStarterMarkdown } from './markdown';

/**
 * Sites service — the heart of the CMS.
 *
 * A "site" is:
 *   - one row in the `sites` table (routing + metadata)
 *   - one markdown file in Appwrite Storage (the content itself)
 *
 * Published sites are served at /{username}/{sitename}.
 */

export class SiteError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = 'site_error', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface SiteRecord {
  id: string;
  userId: string;
  username: string;
  slug: string;
  name: string;
  title: string;
  description: string;
  fileId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRecord {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
}

// ── validation helpers ────────────────────────────────────────────────────

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/; // 3–32 chars
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/; // 1–48 chars

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!username) throw new SiteError('Username is required.', 'invalid_username');
  if (!USERNAME_RE.test(username)) {
    throw new SiteError(
      'Username must be 3–32 characters: lowercase letters, numbers and single dashes (must start and end with a letter or number).',
      'invalid_username',
    );
  }
  if ((RESERVED_USERNAMES as readonly string[]).includes(username)) {
    throw new SiteError('That username is reserved. Please pick another.', 'reserved_username');
  }
  return username;
}

export function validateSlug(raw: string): string {
  const slug = slugify(raw);
  if (!slug) throw new SiteError('Site URL must contain at least one letter or number.', 'invalid_slug');
  if (!SLUG_RE.test(slug)) {
    throw new SiteError('Site URL must be 1–48 characters: lowercase letters, numbers and single dashes.', 'invalid_slug');
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    throw new SiteError('That site URL is reserved. Please pick another.', 'reserved_slug');
  }
  return slug;
}

// ── row mappers ───────────────────────────────────────────────────────────

function str(row: Models.Row, key: string, fallback = ''): string {
  const value = (row as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : fallback;
}

function toSite(row: Models.Row): SiteRecord {
  return {
    id: row.$id,
    userId: str(row, 'userId'),
    username: str(row, 'username'),
    slug: str(row, 'slug'),
    name: str(row, 'name'),
    title: str(row, 'title'),
    description: str(row, 'description'),
    fileId: str(row, 'fileId'),
    createdAt: row.$createdAt ?? new Date().toISOString(),
    updatedAt: row.$updatedAt ?? row.$createdAt ?? new Date().toISOString(),
  };
}

function toProfile(row: Models.Row): ProfileRecord {
  return {
    id: row.$id,
    userId: str(row, 'userId'),
    username: str(row, 'username'),
    createdAt: row.$createdAt ?? new Date().toISOString(),
  };
}

function userPermissions(userId: string): string[] {
  return [Permission.read(Role.user(userId)), Permission.write(Role.user(userId))];
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === 409 || /unique/i.test(e?.message ?? '');
}

// ── profiles ──────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<ProfileRecord | null> {
  const { tables } = getAdminServices();
  const res = await tables.listRows({
    databaseId: config.ids.database,
    tableId: config.ids.profiles,
    queries: [Query.equal('userId', userId), Query.limit(1)],
  });
  return res.rows.length > 0 ? toProfile(res.rows[0]) : null;
}

export async function getProfileByUsername(username: string): Promise<ProfileRecord | null> {
  const { tables } = getAdminServices();
  const res = await tables.listRows({
    databaseId: config.ids.database,
    tableId: config.ids.profiles,
    queries: [Query.equal('username', username), Query.limit(1)],
  });
  return res.rows.length > 0 ? toProfile(res.rows[0]) : null;
}

export async function createProfile(userId: string, rawUsername: string): Promise<ProfileRecord> {
  const { tables } = getAdminServices();
  const username = validateUsername(rawUsername);
  try {
    const row = await tables.createRow<Models.DefaultRow>({
      databaseId: config.ids.database,
      tableId: config.ids.profiles,
      rowId: ID.unique(),
      data: { userId, username, createdAt: new Date().toISOString() },
      permissions: userPermissions(userId),
    });
    return toProfile(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new SiteError('That username is already taken. Please pick another.', 'username_taken', 409);
    }
    throw new SiteError('Could not save your username. Please try again.', 'profile_failed', 500);
  }
}

// ── sites ─────────────────────────────────────────────────────────────────

export async function listSites(userId: string): Promise<SiteRecord[]> {
  const { tables } = getAdminServices();
  const res = await tables.listRows({
    databaseId: config.ids.database,
    tableId: config.ids.sites,
    queries: [Query.equal('userId', userId), Query.orderDesc('$updatedAt'), Query.limit(100)],
  });
  return res.rows.map(toSite);
}

export async function getSiteByUsernameSlug(username: string, slug: string): Promise<SiteRecord | null> {
  const { tables } = getAdminServices();
  const res = await tables.listRows({
    databaseId: config.ids.database,
    tableId: config.ids.sites,
    queries: [Query.equal('username', username), Query.equal('slug', slug), Query.limit(1)],
  });
  return res.rows.length > 0 ? toSite(res.rows[0]) : null;
}

export async function getSiteById(siteId: string): Promise<SiteRecord | null> {
  const { tables } = getAdminServices();
  try {
    const row = await tables.getRow({
      databaseId: config.ids.database,
      tableId: config.ids.sites,
      rowId: siteId,
    });
    return toSite(row);
  } catch {
    return null;
  }
}

export async function getSiteForUser(userId: string, slug: string): Promise<SiteRecord | null> {
  const { tables } = getAdminServices();
  const res = await tables.listRows({
    databaseId: config.ids.database,
    tableId: config.ids.sites,
    queries: [Query.equal('userId', userId), Query.equal('slug', slug), Query.limit(1)],
  });
  return res.rows.length > 0 ? toSite(res.rows[0]) : null;
}

export async function createSite(params: {
  userId: string;
  username: string;
  name: string;
  rawSlug: string;
}): Promise<SiteRecord> {
  const { userId, username } = params;
  const name = params.name.trim().slice(0, 120);
  if (!name) throw new SiteError('Give your site a name.', 'invalid_name');
  const slug = validateSlug(params.rawSlug || name);

  const { tables, storage } = getAdminServices();
  const now = new Date().toISOString();
  const siteId = ID.unique();

  // 1) Create the routing row first — this is where slug conflicts surface.
  let row: Models.Row;
  try {
    row = await tables.createRow<Models.DefaultRow>({
      databaseId: config.ids.database,
      tableId: config.ids.sites,
      rowId: siteId,
      data: {
        userId,
        username,
        slug,
        name,
        title: name,
        description: '',
        fileId: siteId, // file id mirrors the site id until the first edit
        createdAt: now,
        updatedAt: now,
      },
      permissions: userPermissions(userId),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new SiteError(
        `You already have a site at /${username}/${slug}. Pick a different URL.`,
        'slug_taken',
        409,
      );
    }
    throw new SiteError('Could not create the site. Please try again.', 'create_failed', 500);
  }

  // 2) Create the markdown file in Appwrite Storage.
  try {
    await storage.createFile({
      bucketId: config.ids.bucket,
      fileId: siteId,
      file: InputFile.fromPlainText(buildStarterMarkdown(name), `${slug}.md`),
      permissions: userPermissions(userId),
    });
  } catch {
    // compensate so we never leave a row without its file
    await tables
      .deleteRow({
        databaseId: config.ids.database,
        tableId: config.ids.sites,
        rowId: siteId,
      })
      .catch(() => undefined);
    throw new SiteError('Could not create the site file in Appwrite Storage.', 'create_failed', 500);
  }

  return toSite(row);
}

export async function saveSiteContent(site: SiteRecord, content: string): Promise<SiteRecord> {
  const { tables, storage } = getAdminServices();

  if (typeof content !== 'string' || content.length > 1_000_000) {
    throw new SiteError('Content is too large (1 MB max).', 'content_too_large', 413);
  }

  // Front-matter is the source of truth for display metadata.
  let fmTitle: string | undefined;
  let fmDescription: string | undefined;
  try {
    const data = (matter(content).data ?? {}) as Record<string, unknown>;
    if (typeof data.title === 'string' && data.title.trim()) fmTitle = data.title.trim().slice(0, 255);
    if (typeof data.description === 'string' && data.description.trim()) fmDescription = data.description.trim().slice(0, 1024);
  } catch {
    // malformed front-matter — render anyway
  }

  // Write the new file first (no downtime window), then flip the pointer,
  // then clean up the old file.
  const newFileId = ID.unique();
  await storage.createFile({
    bucketId: config.ids.bucket,
    fileId: newFileId,
    file: InputFile.fromPlainText(content, `${site.slug}.md`),
    permissions: userPermissions(site.userId),
  });

  const row = await tables.updateRow<Models.DefaultRow>({
    databaseId: config.ids.database,
    tableId: config.ids.sites,
    rowId: site.id,
    data: {
      fileId: newFileId,
      title: fmTitle ?? site.name,
      description: fmDescription ?? '',
      updatedAt: new Date().toISOString(),
    },
  });

  if (site.fileId && site.fileId !== newFileId) {
    await storage.deleteFile({ bucketId: config.ids.bucket, fileId: site.fileId }).catch(() => undefined);
  }

  return toSite(row);
}

export async function deleteSite(site: SiteRecord): Promise<void> {
  const { tables, storage } = getAdminServices();
  await tables.deleteRow({
    databaseId: config.ids.database,
    tableId: config.ids.sites,
    rowId: site.id,
  });
  if (site.fileId) {
    await storage.deleteFile({ bucketId: config.ids.bucket, fileId: site.fileId }).catch(() => undefined);
  }
}

export async function getSiteMarkdown(site: SiteRecord): Promise<string> {
  const { storage } = getAdminServices();
  try {
    const buffer = await storage.getFileView({ bucketId: config.ids.bucket, fileId: site.fileId });
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    throw new SiteError('Could not read this site\'s markdown file from Appwrite Storage.', 'read_failed', 500);
  }
}
