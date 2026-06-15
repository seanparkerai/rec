// ask/transcript.js — renders the chat transcript: user + assistant bubbles,
// streaming token insertion, a "checking …" tool-status line, and a "sources
// used" footnote. Assistant markdown is rendered by a tiny ESCAPE-FIRST renderer
// (mdToSafeHtml): every input character is HTML-escaped before any formatting is
// applied and only a fixed, safe tag set is emitted, so streamed model output
// can never inject markup (Ask plan §9 "Sanitise Claude's markdown"). The
// assistant bubble is an aria-live polite region for screen-reader streaming.

const TOOL_LABELS = {
  get_finances_detail: 'your finances',
  get_budget_breakdown: 'your budget',
  query_listings: 'live listings',
  get_listing: 'a listing',
  get_saved_properties: 'your saved homes',
  get_reactions_summary: 'your preferences',
  search_areas: 'areas',
  get_area: 'an area',
  get_household_areas: 'your search areas',
  get_trends: 'your trends',
  get_journey_status: 'your buying journey',
  get_outreach_templates: 'outreach templates',
  draft_outreach: 'drafting your message',
};

export function createTranscript(rootEl) {
  const root = rootEl;

  // The transcript lives in normal document flow (the page scrolls, the composer
  // is sticky) — so auto-scroll drives the document's scrolling element, not the
  // transcript node. Only follow new content when the reader is already near the
  // bottom, so streaming tokens never yank the view away from someone scrolled up.
  const scroller = () => document.scrollingElement || document.documentElement;
  const nearBottom = () => {
    const s = scroller();
    return (s.scrollHeight - s.scrollTop - s.clientHeight) < 160;
  };
  const scrollToEnd = (force = false) => {
    if (!force && !nearBottom()) return;
    requestAnimationFrame(() => { const s = scroller(); s.scrollTop = s.scrollHeight; });
  };

  function bubble(role) {
    const el = document.createElement('article');
    el.className = `ask-msg ask-msg--${role}`;
    const body = document.createElement('div');
    body.className = 'ask-msg__body';
    el.appendChild(body);
    root.appendChild(el);
    return { el, body };
  }

  function clear() { root.replaceChildren(); }

  function appendUser(text) {
    const { body } = bubble('user');
    body.textContent = text;
    scrollToEnd(true);
  }

  // Render a finished assistant message (e.g. when reloading a saved thread).
  function appendAssistant(text, tools = []) {
    const { body } = bubble('assistant');
    body.innerHTML = mdToSafeHtml(text);
    if (tools.length) body.appendChild(sourcesLine(tools));
    scrollToEnd(true);
  }

  // Begin a streaming assistant message; returns a small controller.
  function beginAssistant() {
    const { el, body } = bubble('assistant');
    body.setAttribute('aria-live', 'polite');
    const status = document.createElement('p');
    status.className = 'ask-msg__status';
    status.textContent = 'Thinking…';
    body.appendChild(status);

    const content = document.createElement('div');
    content.className = 'ask-msg__md';
    body.appendChild(content);

    let raw = '';
    const tools = [];

    return {
      token(t) {
        if (status.isConnected) status.remove();
        raw += t;
        content.innerHTML = mdToSafeHtml(raw);
        scrollToEnd();
      },
      tool(name) {
        if (!tools.includes(name)) tools.push(name);
        status.textContent = `Checking ${TOOL_LABELS[name] ?? name}…`;
        scrollToEnd();
      },
      end() {
        if (status.isConnected) status.remove();
        content.innerHTML = mdToSafeHtml(raw);
        if (tools.length) body.appendChild(sourcesLine(tools));
        scrollToEnd(true);
        return { text: raw, tools: [...tools] };
      },
      error(message) {
        status.remove();
        const err = document.createElement('p');
        err.className = 'ask-msg__error';
        err.setAttribute('role', 'alert');
        err.textContent = message;
        body.appendChild(err);
        scrollToEnd(true);
        return { text: raw, tools: [...tools] };
      },
    };
  }

  return { clear, appendUser, appendAssistant, beginAssistant };
}

function sourcesLine(tools) {
  const p = document.createElement('p');
  p.className = 'ask-msg__sources';
  const names = tools.map((t) => TOOL_LABELS[t] ?? t);
  p.textContent = `Sources: ${names.join(' · ')}`;
  return p;
}

// ── Tiny escape-first markdown renderer ───────────────────────────────────────
const esc = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inlineMd(s) {
  // Operates on ALREADY-ESCAPED text. Emits only <strong>/<em>/<code>/<a>.
  let out = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // Links [text](http…) — only http/https allowed; text already escaped.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, text, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  return out;
}

export function mdToSafeHtml(src) {
  const text = esc(String(src ?? ''));
  const out = [];
  const lines = text.split('\n');
  let i = 0;
  let listType = null; // 'ul' | 'ol' | null

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```
    if (/^```/.test(line.trim())) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
      i++; // skip closing fence
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    // Headings #..######
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`); i++; continue; }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inlineMd(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i++; continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inlineMd(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++; continue;
    }

    // Blank line — paragraph break
    if (!line.trim()) { closeList(); i++; continue; }

    // Paragraph (collect consecutive non-blank, non-special lines)
    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|```)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
  }
  closeList();
  return out.join('\n');
}
