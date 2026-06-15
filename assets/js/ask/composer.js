// ask/composer.js — the input box: textarea autosize, Enter-to-send
// (Shift+Enter = newline), Send/Stop toggle, suggestion chips on the empty
// state, and disabled/offline states. Pure DOM wiring; the page coordinator
// supplies onSubmit/onStop. Touch targets and safe-area insets are handled in
// the CSS (assets/css/pages/ask.css).

export function createComposer({ form, textarea, sendBtn, stopBtn, chips }, { onSubmit, onStop }) {
  let streaming = false;

  // The textarea is a fixed couple of rows tall and scrolls internally past its
  // max-height (see assets/css/pages/ask.css) — no JS height manipulation (the
  // responsive doctrine bans direct .style assignment).

  const canSend = () => !streaming && textarea.value.trim().length > 0 && navigator.onLine !== false;

  const submit = () => {
    const text = textarea.value.trim();
    if (!text || streaming) return;
    if (navigator.onLine === false) return;
    textarea.value = '';
    refresh();
    onSubmit(text);
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  textarea.addEventListener('input', refresh);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  stopBtn?.addEventListener('click', () => { if (streaming) onStop(); });

  // Suggestion chips: clicking one fills + sends.
  chips?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (!chip || streaming) return;
    textarea.value = chip.textContent.trim();
    submit();
  });

  // Re-evaluate the Send button's enabled state + the online banner.
  function refresh() {
    sendBtn.disabled = !canSend();
  }
  globalThis.addEventListener?.('online', refresh);
  globalThis.addEventListener?.('offline', refresh);

  function setStreaming(on) {
    streaming = on;
    form.dataset.streaming = on ? 'true' : 'false';
    textarea.disabled = on;
    sendBtn.hidden = on;
    if (stopBtn) stopBtn.hidden = !on;
    refresh();
    if (!on) { textarea.focus(); }
  }

  refresh();
  return { setStreaming, focus: () => textarea.focus(), refresh };
}
