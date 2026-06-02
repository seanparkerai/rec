// svg.js — SVG creation helpers. Browser-only.

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element in the SVG namespace with attributes set in one call.
 * @param {string} tag  e.g. 'svg', 'line', 'rect', 'text'
 * @param {Record<string, string|number>} [attrs]
 * @returns {SVGElement}
 */
export function createSVGElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
