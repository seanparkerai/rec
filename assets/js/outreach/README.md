# outreach/

Outreach feature modules for contacting estate agents, brokers, solicitors, and surveyors during the home-buying journey.

## Architecture

- **state.js** — shared state object, role labels, and stage labels; the single source of truth for active filters, templates, contacts, and log entries.
- **dialog.js** — modal for drafting outreach messages; renders template preview, manages extra context fields, and handles send/copy/save actions.
- **grid.js** — renders a grid of message templates filtered by stage and role; binds generate buttons to open the dialog.
- **filters.js** — stage and role filter chips; updates the grid on selection change.
- **contacts.js** — grouped contact list (agents, brokers, solicitors, surveyors) with inline add/delete forms and storage integration.
- **context.js** — assembles message context from profile, criteria, finances, and form inputs; defines the extra data-needed fields.
- **log.js** — outreach activity log table; binds buttons to mark messages as sent, replied, or archived.
- **toast.js** — simple notification helper with auto-dismiss timer.

Run `find assets/js/outreach -name '*.js'` for the live module list.

See docs/REPO_MAP.md for the whole-repo map.
