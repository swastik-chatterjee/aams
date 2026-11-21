/**
 * Tiny Dracula-styled toast notifications shared by the client islands.
 */

export type ToastKind = 'ok' | 'error';

export function showToast(message: string, kind: ToastKind = 'ok'): void {
  const host =
    document.getElementById('toast-host') ??
    (() => {
      const el = document.createElement('div');
      el.id = 'toast-host';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(el);
      return el;
    })();

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.style.cssText = [
    'max-width:320px',
    'padding:10px 16px',
    'border-radius:10px',
    'font-size:12px',
    'font-family:var(--font-mono, ui-monospace, monospace)',
    'border:1px solid',
    'background:#21222c',
    'color:' + (kind === 'ok' ? '#50fa7b' : '#ff5555'),
    'border-color:' + (kind === 'ok' ? 'rgba(80,250,123,0.5)' : 'rgba(255,85,85,0.5)'),
    'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
    'opacity:0',
    'transform:translateY(6px)',
    'transition:opacity .18s ease, transform .18s ease',
  ].join(';');
  toast.textContent = message;

  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}
