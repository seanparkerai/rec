let _toastEl = null;

export function showToast(msg, isError = false) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.setAttribute('role', 'status');
    _toastEl.setAttribute('aria-live', 'polite');
    _toastEl.className = 'storage-toast';
    Object.assign(_toastEl.style, {
      position: 'fixed',
      bottom: 'max(1rem, env(safe-area-inset-bottom))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      color: 'var(--paper)',
      padding: '0.5rem 1.25rem',
      borderRadius: 'var(--rec-radius-sm)',
      fontFamily: 'var(--font-body)',
      fontSize: '0.875rem',
      zIndex: '9999',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.style.background = isError ? 'oklch(42% 0.18 25)' : 'var(--ink)';
  _toastEl.style.opacity = '1';
  clearTimeout(_toastEl._t);
  _toastEl._t = setTimeout(() => { _toastEl.style.opacity = '0'; }, 3500);
}
