/**
 * Dashboard island:
 * - live username validation during onboarding
 * - auto-slug sync on the "new site" form
 * - copy-public-link buttons
 * - delete-site buttons (confirm + fetch)
 */
import { showToast } from '../toast';

// ── username onboarding ────────────────────────────────────────────────
const usernameInput = document.getElementById('username') as HTMLInputElement | null;
const usernameHint = document.getElementById('username-hint');
const usernameForm = document.getElementById('username-form') as HTMLFormElement | null;

if (usernameInput && usernameHint) {
  const reserved = new Set(
    (usernameInput.dataset.reserved ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const ok = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

  const validate = (): void => {
    const value = usernameInput.value.trim().toLowerCase();
    if (value === '') {
      usernameHint.textContent = '3–32 chars · lowercase letters, numbers, dashes · permanent';
      usernameHint.style.color = '';
      return;
    }
    if (!ok.test(value)) {
      usernameHint.textContent = 'use 3–32 lowercase letters, numbers and single dashes — must start and end with a letter or number';
      usernameHint.style.color = '#ff5555';
      return;
    }
    if (reserved.has(value)) {
      usernameHint.textContent = 'that username is reserved by the system — pick another';
      usernameHint.style.color = '#ff5555';
      return;
    }
    usernameHint.textContent = `looks good — your sites will live at /${value}/sitename`;
    usernameHint.style.color = '#50fa7b';
  };

  usernameInput.addEventListener('input', validate);
  validate();
}

// Prevent double submits on both dashboard forms.
for (const form of [usernameForm, document.getElementById('new-site-form') as HTMLFormElement | null]) {
  if (!form) continue;
  form.addEventListener('submit', () => {
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (button) {
      button.disabled = true;
      // Visual only — the submit still carries the field values.
      window.setTimeout(() => (button.disabled = false), 8000);
    }
  });
}

// ── new site: auto-slug ────────────────────────────────────────────────
const nameInput = document.getElementById('site-name') as HTMLInputElement | null;
const slugInput = document.getElementById('site-slug') as HTMLInputElement | null;

if (nameInput && slugInput) {
  let slugTouched = false;
  slugInput.addEventListener('input', () => {
    slugTouched = true;
  });

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '');

  nameInput.addEventListener('input', () => {
    if (!slugTouched) {
      slugInput.value = slugify(nameInput.value);
    }
  });
}

// ── copy public link ───────────────────────────────────────────────────
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-url]')) {
  button.addEventListener('click', async () => {
    const path = button.dataset.copyUrl ?? '';
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      showToast('link copied to clipboard');
    } catch {
      showToast('could not copy — select the address bar instead', 'error');
    }
  });
}

// ── delete site ────────────────────────────────────────────────────────
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-delete-site]')) {
  button.addEventListener('click', async () => {
    const siteId = button.dataset.siteId ?? '';
    const label = button.dataset.siteLabel ?? 'this site';
    if (!siteId) return;

    if (!window.confirm(`Delete ${label}?\n\nThis permanently removes the site document and its markdown file from Appwrite Storage. There is no undo.`)) {
      return;
    }

    button.disabled = true;
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(data?.error ?? 'could not delete the site', 'error');
        button.disabled = false;
        return;
      }
      showToast('site deleted');
      window.setTimeout(() => window.location.reload(), 450);
    } catch {
      showToast('network error — try again', 'error');
      button.disabled = false;
    }
  });
}
