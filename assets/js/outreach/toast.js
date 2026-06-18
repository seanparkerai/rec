// outreach/toast.js — simple toast notification helper: lazy-creates an aria-live region and shows/hides messages with a timer. DOM utility.

let _toastEl = null;

export function showToast(msg, isError = false) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.setAttribute('role', 'status');
    _toastEl.setAttribute('aria-live', 'polite');
    _toastEl.className = 'outreach-toast';
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.toggle('outreach-toast--error', isError);
  _toastEl.classList.add('is-visible');
  clearTimeout(_toastEl._t);
  _toastEl._t = setTimeout(() => { _toastEl.classList.remove('is-visible'); }, 3500);
}
