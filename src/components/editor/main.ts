/**
 * Editor island — split-view markdown editing.
 *
 * - debounced live preview via POST /api/preview (same pipeline as the
 *   published page, so preview === production)
 * - save with the button or Ctrl/Cmd+S
 * - dirty-state tracking with an unload guard
 * - delete with confirmation
 */
import { showToast } from '../toast';

const root = document.querySelector<HTMLElement>('[data-editor]');
const textarea = document.getElementById('md-editor') as HTMLTextAreaElement | null;
const preview = document.getElementById('md-preview');
const previewState = document.getElementById('preview-state');
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement | null;
const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement | null;
const saveState = document.getElementById('save-state');
const wordCount = document.getElementById('word-count');

if (root && textarea && preview && saveBtn) {
  const siteId = root.dataset.siteId ?? '';

  let dirty = false;
  let saving = false;
  let previewToken = 0;

  // ── helpers ──────────────────────────────────────────────────────────
  function debounce<F extends (...args: never[]) => void>(fn: F, wait: number): F {
    let t: number | undefined;
    return ((...args: never[]) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => fn(...args), wait);
    }) as F;
  }

  const updateCount = (): void => {
    if (!wordCount) return;
    const words = textarea.value.trim().match(/\S+/g);
    wordCount.textContent = String(words ? words.length : 0);
  };

  const updateSaveState = (): void => {
    if (saveState) {
      saveState.textContent = dirty ? 'unsaved changes — ctrl/cmd+s' : 'all changes saved';
      saveState.style.color = dirty ? '#ffb86c' : '';
    }
  };

  // ── live preview ─────────────────────────────────────────────────────
  const refreshPreview = debounce(async (markdown: string): Promise<void> => {
    const token = ++previewToken;
    if (previewState) previewState.textContent = 'rendering…';
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      if (token !== previewToken) return; // a newer edit superseded this render
      if (res.ok) {
        const data = (await res.json()) as { html?: string };
        preview.innerHTML = data.html ?? '';
        if (previewState) previewState.textContent = 'live';
      } else if (previewState) {
        previewState.textContent = 'preview error';
      }
    } catch {
      if (token === previewToken && previewState) {
        previewState.textContent = 'preview error';
      }
    }
  }, 350);

  textarea.addEventListener('input', () => {
    dirty = true;
    updateSaveState();
    updateCount();
    refreshPreview(textarea.value);
  });

  // ── save ─────────────────────────────────────────────────────────────
  const save = async (): Promise<void> => {
    if (saving || !siteId) return;
    saving = true;
    const original = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.textContent = 'saving…';
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: textarea.value }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        showToast(data?.error ?? 'could not save', 'error');
        return;
      }
      dirty = false;
      updateSaveState();
      showToast('saved — your site is live');
    } catch {
      showToast('network error — not saved', 'error');
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.innerHTML = original;
    }
  };

  saveBtn.addEventListener('click', () => {
    void save();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── delete ───────────────────────────────────────────────────────────
  deleteBtn?.addEventListener('click', async () => {
    if (!siteId) return;
    if (!window.confirm('Delete this site?\n\nThe document and its markdown file are permanently removed from Appwrite Storage. There is no undo.')) {
      return;
    }
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('site deleted');
        window.setTimeout(() => (window.location.href = '/dashboard'), 450);
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(data?.error ?? 'could not delete', 'error');
        deleteBtn.disabled = false;
      }
    } catch {
      showToast('network error — try again', 'error');
      deleteBtn.disabled = false;
    }
  });

  // initial counts
  updateCount();
  updateSaveState();
}
