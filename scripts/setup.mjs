#!/usr/bin/env node
/**
 * Dracula CMS — Appwrite provisioning script.
 *
 * Creates everything the CMS needs inside your Appwrite project:
 *
 *   Database "cms"
 *   ├─ Table "profiles"  (userId ↔ username, both unique)
 *   └─ Table "sites"     (routing + metadata, unique [username, slug])
 *   Storage bucket "sites" (one markdown file per site)
 *
 * Uses the modern TablesDB API (tables / columns / rows).
 * Safe to re-run: existing resources are detected and reused.
 *
 * Usage:  npm run setup     (requires APPWRITE_* vars in .env)
 */
import { Client, TablesDB, Storage } from 'node-appwrite';

// ── load .env (tiny parser so we need no dotenv dependency) ──────────────
import { readFileSync } from 'node:fs';

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
    for (const line of raw.split('\n')) {
      const match = /^[ \t]*([A-Z0-9_]+)[ \t]*=[ \t]*(.*)[ \t]*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value; // real env wins over .env
    }
  } catch {
    // no .env — rely on real environment variables
  }
}

loadEnv();

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'cms';
const SITES_TABLE_ID = process.env.APPWRITE_SITES_COLLECTION_ID || 'sites';
const PROFILES_TABLE_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || 'profiles';
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || 'sites';

const log = (msg) => console.log(`  ${msg}`);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

const PURPLE = (s) => `\x1b[35m${s}\x1b[0m`;

console.log(`\n${PURPLE('── dracula-cms · appwrite setup ──')}\n`);

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  die(
    'Missing Appwrite configuration.\n' +
      '    Copy .env.example to .env and fill in APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID\n' +
      '    and APPWRITE_API_KEY first (see the README for where to find each value).',
  );
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const tables = new TablesDB(client);
const storage = new Storage(client);

const exists = (err) => {
  const e = err;
  return e?.code === 409 || /already exist/i.test(e?.message ?? '');
};

// ── 1. database ──────────────────────────────────────────────────────────
async function ensureDatabase() {
  try {
    await tables.get({ databaseId: DATABASE_ID });
    ok(`database "${DATABASE_ID}" already exists — reusing`);
  } catch (err) {
    if (!exists(err)) {
      die(`Could not read database "${DATABASE_ID}": ${err.message ?? err}\n    Check the API key scopes (databases.read/write).`);
    }
    try {
      await tables.create({ databaseId: DATABASE_ID, name: 'Dracula CMS' });
      ok(`database "${DATABASE_ID}" created`);
    } catch (err2) {
      if (exists(err2)) ok(`database "${DATABASE_ID}" already exists — reusing`);
      else die(`Could not create database: ${err2.message ?? err2}`);
    }
  }
}

// ── 2. tables + columns ──────────────────────────────────────────────────
async function ensureTable(tableId, name) {
  try {
    await tables.getTable({ databaseId: DATABASE_ID, tableId });
    ok(`table "${tableId}" already exists — reusing`);
    return;
  } catch (err) {
    if (!exists(err)) {
      die(`Could not read table "${tableId}": ${err.message ?? err}\n    Check the API key scopes (tables.read/write).`);
    }
  }
  try {
    await tables.createTable({
      databaseId: DATABASE_ID,
      tableId,
      name,
      permissions: [], // server-only; access happens through the CMS with the API key
      rowSecurity: true, // per-row user permissions apply
    });
    ok(`table "${tableId}" created`);
  } catch (err) {
    if (exists(err)) ok(`table "${tableId}" already exists — reusing`);
    else die(`Could not create table "${tableId}": ${err.message ?? err}`);
  }
}

async function ensureStringColumn(tableId, key, size, required) {
  try {
    await tables.createStringColumn({
      databaseId: DATABASE_ID,
      tableId,
      key,
      size,
      required,
    });
    log(`column ${tableId}.${key} created`);
  } catch (err) {
    if (exists(err)) {
      log(`column ${tableId}.${key} already exists`);
    } else {
      die(`Could not create column ${tableId}.${key}: ${err.message ?? err}`);
    }
  }
}

async function ensureDatetimeColumn(tableId, key, required) {
  try {
    await tables.createDatetimeColumn({
      databaseId: DATABASE_ID,
      tableId,
      key,
      required,
    });
    log(`column ${tableId}.${key} created`);
  } catch (err) {
    if (exists(err)) {
      log(`column ${tableId}.${key} already exists`);
    } else {
      die(`Could not create column ${tableId}.${key}: ${err.message ?? err}`);
    }
  }
}

async function ensureIndex(tableId, key, type, columns) {
  try {
    await tables.createIndex({
      databaseId: DATABASE_ID,
      tableId,
      key,
      type,
      columns,
    });
    ok(`index ${tableId}.${key} (${type}) created`);
  } catch (err) {
    if (exists(err)) {
      log(`index ${tableId}.${key} already exists`);
    } else {
      die(`Could not create index ${tableId}.${key}: ${err.message ?? err}`);
    }
  }
}

/** Columns are created asynchronously — wait until they leave "processing". */
async function waitForColumns(tableId, keys) {
  process.stdout.write('  waiting for columns to become available');
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const states = await Promise.all(
        keys.map(async (key) => {
          const column = await tables.getColumn({
            databaseId: DATABASE_ID,
            tableId,
            key,
          });
          return column.status;
        }),
      );
      if (states.every((s) => s === 'available')) break;
      if (states.some((s) => s === 'failed' || s === 'stuck')) {
        die(`A column in "${tableId}" failed to create. Delete the table and re-run setup.`);
      }
    } catch {
      // transient read errors are fine while creating
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(' done');
}

async function ensureProfiles() {
  await ensureTable(PROFILES_TABLE_ID, 'Profiles');
  await ensureStringColumn(PROFILES_TABLE_ID, 'userId', 255, true);
  await ensureStringColumn(PROFILES_TABLE_ID, 'username', 64, true);
  await ensureDatetimeColumn(PROFILES_TABLE_ID, 'createdAt', true);
  await waitForColumns(PROFILES_TABLE_ID, ['userId', 'username', 'createdAt']);
  await ensureIndex(PROFILES_TABLE_ID, 'uk_username', 'unique', ['username']);
  await ensureIndex(PROFILES_TABLE_ID, 'uk_userId', 'unique', ['userId']);
}

async function ensureSites() {
  await ensureTable(SITES_TABLE_ID, 'Sites');
  await ensureStringColumn(SITES_TABLE_ID, 'userId', 255, true);
  await ensureStringColumn(SITES_TABLE_ID, 'username', 64, true);
  await ensureStringColumn(SITES_TABLE_ID, 'slug', 64, true);
  await ensureStringColumn(SITES_TABLE_ID, 'name', 128, true);
  await ensureStringColumn(SITES_TABLE_ID, 'title', 255, false);
  await ensureStringColumn(SITES_TABLE_ID, 'description', 1024, false);
  await ensureStringColumn(SITES_TABLE_ID, 'fileId', 255, true);
  await ensureDatetimeColumn(SITES_TABLE_ID, 'createdAt', true);
  await ensureDatetimeColumn(SITES_TABLE_ID, 'updatedAt', true);
  await waitForColumns(SITES_TABLE_ID, [
    'userId', 'username', 'slug', 'name', 'title', 'description', 'fileId', 'createdAt', 'updatedAt',
  ]);
  await ensureIndex(SITES_TABLE_ID, 'uk_username_slug', 'unique', ['username', 'slug']);
  await ensureIndex(SITES_TABLE_ID, 'idx_userId', 'key', ['userId']);
}

// ── 3. storage bucket ───────────────────────────────────────────────────
async function ensureBucket() {
  try {
    await storage.getBucket({ bucketId: BUCKET_ID });
    ok(`bucket "${BUCKET_ID}" already exists — reusing`);
    return;
  } catch (err) {
    if (!exists(err)) {
      die(`Could not read bucket "${BUCKET_ID}": ${err.message ?? err}\n    Check the API key scopes (buckets.read/write).`);
    }
  }
  try {
    await storage.createBucket({
      bucketId: BUCKET_ID,
      name: 'Site markdown files',
      permissions: [], // no public access; the CMS reads with the API key
      fileSecurity: true, // per-file user permissions apply
      maximumFileSize: 5 * 1024 * 1024, // 5 MB — plenty for markdown
      allowedFileExtensions: ['md', 'markdown', 'txt'],
      encryption: true,
      antivirus: true,
    });
    ok(`bucket "${BUCKET_ID}" created`);
  } catch (err) {
    if (exists(err)) ok(`bucket "${BUCKET_ID}" already exists — reusing`);
    else die(`Could not create bucket: ${err.message ?? err}`);
  }
}

// ── 4. smoke test ───────────────────────────────────────────────────────
async function smokeTest() {
  process.stdout.write('  smoke-testing API key scopes (rows + files)… ');
  try {
    await tables.listRows({
      databaseId: DATABASE_ID,
      tableId: SITES_TABLE_ID,
      queries: [],
    });
    await storage.listFiles({ bucketId: BUCKET_ID, queries: [] });
    console.log('\x1b[32mok\x1b[0m');
  } catch (err) {
    console.log('\x1b[31mfailed\x1b[0m');
    warn(`The key can create resources but listing failed: ${err.message ?? err}`);
    warn('If this persists, recreate the API key with the full scope list from the README.');
  }
}

// ── run ─────────────────────────────────────────────────────────────────
await ensureDatabase();
await ensureProfiles();
await ensureSites();
await ensureBucket();
await smokeTest();

console.log(`\n${PURPLE('── setup complete ──')}`);
console.log(`
  next steps:
    1. npm run dev
    2. open http://localhost:3000 and log in with a magic link
    3. remember: add your hostname (localhost) as a Web Platform in the
       Appwrite console, or magic links will be rejected.

  your sites will be served at:  https://your-domain/username/sitename
`);
