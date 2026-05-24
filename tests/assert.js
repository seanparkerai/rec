// assert.js — minimal assertion + reporting helper (no dependencies).
export const results = [];

export async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: e?.message || String(e) }); }
}

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

export function render(target) {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const ok = failed === 0;
  const head = document.createElement('h2');
  head.textContent = `${ok ? '✓' : '✗'} ${passed}/${results.length} passed`;
  head.style.color = ok ? '#2e7d5b' : '#c0392b';
  target.appendChild(head);

  const ul = document.createElement('ul');
  ul.className = 'mini-list';
  for (const r of results) {
    const li = document.createElement('li');
    li.innerHTML = r.pass
      ? `<span style="color:#2e7d5b">PASS</span> — ${escapeHtml(r.name)}`
      : `<span style="color:#c0392b">FAIL</span> — ${escapeHtml(r.name)}: <code>${escapeHtml(r.error)}</code>`;
    ul.appendChild(li);
  }
  target.appendChild(ul);
  document.title = `${ok ? 'PASS' : 'FAIL'} · tests · rec`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
