import { byId, on } from './dom.js';

// Save-bar proxy: delegate to the criteria section's own Cancel/Save buttons.
on(byId('save-bar-cancel'), 'click', () => byId('btn-cancel')?.click());
on(byId('save-bar-save'),   'click', () => byId('btn-save')?.click());
