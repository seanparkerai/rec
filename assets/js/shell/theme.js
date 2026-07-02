// shell/theme.js — the theme toggle WIRING (step 3.3b). The pure mechanics
// (effectiveTheme/applyTheme/updateToggle) live in shell-core.js; this module
// binds them to the injected header button. Collaborators are injectable so
// the page tier can exercise the wiring under jsdom.
import { THEME_KEY, effectiveTheme, applyTheme, updateToggle } from '../shell-core.js';

/**
 * @param {object} [opts]
 * @param {Document} [opts.doc]
 * @param {{getItem(k:string):string|null, setItem(k:string,v:string):void}} [opts.store]
 * @param {() => boolean} [opts.prefersDark]
 */
export function initTheme({
  doc = document,
  store = localStorage,
  prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches,
} = {}) {
  applyTheme(store.getItem(THEME_KEY), doc);
  const btn = doc.getElementById('theme-toggle');
  if (!btn) return;
  updateToggle(btn, { store, prefersDark });
  btn.addEventListener('click', () => {
    const next = effectiveTheme({ store, prefersDark }) === 'dark' ? 'light' : 'dark';
    store.setItem(THEME_KEY, next);
    applyTheme(next, doc);
    updateToggle(btn, { store, prefersDark });
  });
}
