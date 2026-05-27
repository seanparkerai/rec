// outreach-renderer.js — pure template renderer for the outreach generator.
// No DOM, no storage. Safe to run in Node (tests) and browser.

/**
 * Resolve a dotted path (e.g. "profile.firstName") against an object.
 * Returns undefined for any missing segment — never throws.
 */
export function resolvePath(obj, path) {
  if (obj == null || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Render a template against a context object.
 * - {{path}} is substituted with the resolved value (as a string).
 * - {{#if path}}…{{/if}} blocks are included if the resolved value is truthy.
 * - Missing paths are left as {{path}} literals and added to missingFields.
 *
 * Returns { subject, body, missingFields: string[] }
 */
export function renderTemplate(template, ctx) {
  const missing = new Set();

  function substitute(str) {
    // Process {{#if path}}…{{/if}} blocks first.
    str = str.replace(/\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, path, inner) => {
      const val = resolvePath(ctx, path.trim());
      if (!val && val !== 0) return '';
      return substitute(inner);
    });

    // Substitute {{path}} placeholders.
    str = str.replace(/\{\{(?!#if|\/if)([^}]+)\}\}/g, (_match, path) => {
      const key = path.trim();
      const val = resolvePath(ctx, key);
      if (val === undefined || val === null) {
        missing.add(key);
        return `{{${key}}}`;
      }
      return String(val);
    });

    return str;
  }

  const subject = substitute(template.subjectTemplate || '');
  const body = substitute(template.bodyTemplate || '');

  return { subject, body, missingFields: [...missing] };
}

/**
 * Build a mailto: URI from the given parts.
 * Returns { mailto: string|null, useClipboard: boolean }.
 * If the encoded URL exceeds 1800 chars, returns mailto: null + useClipboard: true
 * because Outlook on Windows truncates at ~2000 chars.
 */
export function buildMailto({ to = '', cc = '', subject = '', body = '' }) {
  const params = new URLSearchParams();
  if (cc) params.set('cc', cc);
  params.set('subject', subject);
  params.set('body', body);

  // URLSearchParams uses application/x-www-form-urlencoded (+ for space);
  // mailto: requires percent-encoding. Convert manually.
  const encoded = params.toString().replace(/\+/g, '%20');
  const url = `mailto:${encodeURIComponent(to)}?${encoded}`;

  if (url.length > 1800) {
    return { mailto: null, useClipboard: true };
  }
  return { mailto: url, useClipboard: false };
}

/**
 * Flatten multiple data sources into a single lookup context.
 * extras covers free-text fields captured in the UI (offerDeadline, surveyConcerns, etc.)
 *
 * The returned object has top-level keys: profile, criteria, finances, area, listing, contact
 * plus any extras keys merged at the top level.
 */
export function assembleContext({ profile = null, criteria = null, finances = null, area = null, listing = null, contact = null, extras = {} } = {}) {
  const ctx = {};
  if (profile)   ctx.profile   = profile;
  if (criteria)  ctx.criteria  = criteria;
  if (finances)  ctx.finances  = finances;
  if (area)      ctx.area      = area;
  if (listing)   ctx.listing   = listing;
  if (contact)   ctx.contact   = contact;
  // Merge extras at top level so paths like "offerDeadline" resolve directly.
  if (extras && typeof extras === 'object') {
    Object.assign(ctx, extras);
  }
  return ctx;
}

/**
 * Filter a context object so only paths listed in template.dataNeeded are accessible.
 * Any path NOT in dataNeeded is removed before rendering, implementing the
 * Quantity-of-Information Ladder from the plan.
 *
 * Returns a new, filtered context object. Paths not in dataNeeded will be missing,
 * causing renderTemplate to leave them as {{path}} literals with reason: 'not-in-data-needed'.
 */
export function filterContextByDataNeeded(ctx, dataNeeded) {
  if (!Array.isArray(dataNeeded)) return ctx;
  const filtered = {};
  for (const path of dataNeeded) {
    const val = resolvePath(ctx, path);
    if (val !== undefined) {
      setPath(filtered, path, val);
    }
  }
  return filtered;
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
