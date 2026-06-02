// css-vars.js — read computed CSS custom-property values. Browser-only.

/**
 * Read a CSS custom property as a trimmed string.
 * @param {string} name  e.g. "--accent"
 * @param {Element} [el=document.documentElement]
 * @returns {string} trimmed value, or '' if not set.
 */
export const cssVar = (name, el = document.documentElement) =>
  getComputedStyle(el).getPropertyValue(name).trim();
