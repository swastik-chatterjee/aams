# Dracula CMS

A small, self-hostable markdown CMS built with **[Astro](https://astro.build)** and **[Appwrite Cloud](https://appwrite.io)**.

- **Magic-link login** — enter your email, click the link Appwrite emails you, done. No passwords.
- **One site = one markdown file** — every site's content is a single `.md` file in your own Appwrite Storage bucket.
- **Unlimited sites** — each user claims a username and publishes at `https://your-domain/username/sitename`.
- **Split-view editor** — markdown on the left, live preview on the right, rendered by the exact same pipeline as the published page.
- **Front-matter support** — set `title` and `description` at the top of the file for the page header and SEO tags.
- **Dracula theme everywhere** — dashboard and published sites, official palette, syntax-highlighted code.

> The app is meant to be hosted at a dedicated domain (e.g. `cms.yourdomain.dev`).
> Every site it publishes then lives at `https://cms.yourdomain.dev/username/sitename`.

---

## How it works

```
browser ──▶ Astro (SSR, Node server)  ──▶ Appwrite Cloud
             │  magic-link auth          ├─ Account API   (tokens + sessions)
             │  session cookie           ├─ Databases     (profiles, sites)
             │  markdown pipeline        └─ Storage       (one .md file per site)
             └──▶ renders Dracula-styled HTML
```

| Concern | Where it lives |
| --- | --- |
| Login | `account.createMagicURLToken()` (server, API key) — Appwrite Cloud emails the link itself via its default SMTP |
| Session | `account.createSession()` exchanges the token; the session secret sits in an httpOnly cookie |
| Users | Created automatically by Appwrite on first magic link |
| Username | One row in the `profiles` table (unique), anchors `/username/...` URLs |
| Site | One row in `sites` (routing + metadata) **and** one markdown file in the `sites` bucket |
| Rendering | markdown-it + highlight.js (Dracula) + sanitize-html, server-side only |

## Requirements

- Node.js **18.17+** (20 or 22 recommended)
- A free [Appwrite Cloud](https://cloud.appwrite.io) account
- ~10 minutes

## Setup

### 1. Create an Appwrite project

1. Sign up at [cloud.appwrite.io](https://cloud.appwrite.io) (free tier is enough).
2. **Create a project** — note the **Project ID** (Console → Overview).
3. Note your **API endpoint** (Console → Settings) — it is region-specific, e.g. `https://fra.cloud.appwrite.io/v1`.

### 2. Create an API key

Console → **Overview → Integrations → API keys → Create API key**, and enable these scopes:

| Group | Scopes |
| --- | --- |
| Users | `users.read`, `users.write` |
| Sessions | `sessions.write` |
| Databases | `databases.read`, `databases.write` |
| Tables | `tables.read`, `tables.write` |
| Columns | `columns.read`, `columns.write` |
| Indexes | `indexes.read`, `indexes.write` |
| Rows | `rows.read`, `rows.write` |
| Storage | `buckets.read`, `buckets.write`, `files.read`, `files.write` |

Copy the key once it is created.

### 3. Register your hostname as a Web Platform

Console → **Overview → Integrations → Platforms → Add platform → Web App**.

- For local dev, add hostname **`localhost`**.
- For production, add your real hostname (e.g. `cms.yourdomain.dev`).

> This step is **required**: Appwrite only allows magic-link redirects to URLs
> whose hostname is in the platform list (open-redirect protection). If you skip
> it, login links will be rejected with a hostname/platform error.

### 4. Configure the app

```bash
git clone <this repo> dracula-cms && cd dracula-cms
npm install
cp .env.example .env
```

Fill in `.env`:

```ini
APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1   # your region
APPWRITE_PROJECT_ID=xxxxxxxxxxxx                     # from the console
APPWRITE_API_KEY=standard_...                         # from step 2
SITE_URL=http://localhost:3000                       # where THIS app runs (no trailing slash)
```

`SITE_URL` is used to build magic links (`SITE_URL/auth/verify?...`). In production set it to the public URL of the app.

### 5. Provision Appwrite (database, tables, bucket)

```bash
npm run setup
```

The script creates the `cms` database, the `profiles` and `sites` tables (with
unique indexes), and the `sites` storage bucket. It is idempotent —
re-running it is always safe.

### 6. Run

```bash
npm run dev          # http://localhost:3000
```

Open the app, enter your email on the login page, click the link in your
inbox, pick a username, create your first site — it is now live at
`http://localhost:3000/username/sitename`.

> **Emails**: Appwrite Cloud sends magic-link emails from its own domain via
> the built-in default SMTP — no custom SMTP provider is needed. If mail does
> not arrive, check the spam folder.

## Writing sites

Each site starts with a starter file that looks like this:

```markdown
---
title: "My Site"
description: "A short description used for the page header and meta tags."
---

# My Site

Markdown **everything** — lists, `code`, quotes, tables…

```ts
const hello = "world"; // highlighted with the Dracula theme
```
```

- `title` / `description` front-matter controls the published page's header and SEO tags.
- The editor shows a live preview rendered by the same server-side pipeline that serves the public page.
- `Ctrl/Cmd + S` saves. Saving swaps in a new markdown file and updates the site's metadata — published pages are always fresh.

### URL rules

- Usernames: 3–32 chars, `a-z 0-9 -`, cannot change later (they are the URL namespace). Reserved words (`api`, `login`, `dashboard`, …) are blocked.
- Site slugs: 1–48 chars, same character rules, unique per user.

## Project structure

```
├── scripts/setup.mjs               # Appwrite provisioning (npm run setup)
├── src/
│   ├── middleware.ts               # session + auth guards + CSRF-lite
│   ├── styles/global.css           # Dracula theme tokens, prose + hljs styles
│   ├── lib/
│   │   ├── config.ts               # env validation, reserved names
│   │   ├── appwrite.ts             # admin (API key) + user (session) clients
│   │   ├── auth.ts                 # magic link, session exchange, throttle
│   │   ├── sites.ts                # sites/profiles service (docs + files)
│   │   ├── markdown.ts             # front-matter → markdown-it → sanitize
│   │   └── request.ts              # body parsing, JSON/redirect helpers
│   ├── components/                 # Icon, Logo, Header, Footer + islands
│   │   ├── dashboard/main.ts       # username validation, slug sync, delete/copy
│   │   └── editor/main.ts          # live preview, save, delete
│   ├── layouts/                    # BaseLayout (app), SiteLayout (public sites)
│   └── pages/
│       ├── index.astro             # landing
│       ├── login.astro             # magic-link request
│       ├── auth/verify.astro       # magic-link landing → session
│       ├── dashboard/              # onboarding, sites list, editor
│       ├── [username]/[sitename].astro   # ⭐ published sites
│       └── api/                    # auth, profile, sites CRUD, preview
└── .env.example
```

## Deployment

The app is a standard Astro SSR Node server:

```bash
npm run build      # outputs ./dist
npm run start      # node ./dist/server/entry.mjs  (honors PORT and HOST)
```

Any Node host works (Railway, Render, Fly.io, a VPS with a reverse proxy, …).

Checklist:

1. Set all `.env` variables on the host; `SITE_URL` must be the public URL (`https://cms.yourdomain.dev`).
2. Add that hostname as a **Web Platform** in the Appwrite console (step 3 above).
3. Run `npm run setup` once from the host (or anywhere with the same `.env`) before first use.

Serving under a subpath (e.g. `example.com/cms/`) is not supported — host the
app at a domain or subdomain root, which matches the `/username/sitename` URL
scheme.

## Security notes

- Session secret lives in an **httpOnly, SameSite=Lax** cookie; every request is re-validated against Appwrite.
- Rendered markdown is passed through **sanitize-html** with a strict allowlist (raw HTML in markdown is filtered).
- Site rows and files carry per-user permissions; the bucket and tables have no public access — all reads go through this app's server.
- Cross-origin `POST`/`PUT`/`DELETE` to `/api/*` are rejected; magic-link requests are throttled per email and per IP.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Magic link request fails with a hostname/platform error | Add your app's hostname (`localhost` in dev) as a **Web Platform** in the Appwrite console (Setup step 3). |
| `user_unauthorized` from Appwrite | The API key lacks a scope — recreate it with the full scope table from Setup step 2. |
| Login email never arrives | Appwrite Cloud's default SMTP sends it; check spam. Also confirm the recipient address. |
| `npm run setup` says "already exists" | Fine — the script reuses existing resources. |
| Public site 404s | Check the exact URL: usernames and slugs are lowercase. The dashboard shows each site's real path. |
| Preview pane shows "preview error" | The `/api/preview` call failed — check the server logs and your Appwrite config. |

## Customization

- **Colors** — every color is a token in `src/styles/global.css` (`@theme` block): change `--color-purple`, `--color-bg`, … once and the whole app follows.
- **Fonts** — JetBrains Mono is bundled via `@fontsource-variable/jetbrains-mono`; swap the `--font-mono` token to change it everywhere.
- **Markdown pipeline** — `src/lib/markdown.ts` is the single source of rendering truth; add markdown-it plugins there and both the preview and published pages change together.

---

Built with Astro, Appwrite, and a fondness for the night.
