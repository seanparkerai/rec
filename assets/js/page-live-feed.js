// page-live-feed.js — coordinator for the /live-feed admin kiosk.
//
// Observe-only (CLAUDE.md / LIVE_FEED_PLAN §5): it NEVER triggers a fetch. It
// reads the admin aggregate RPC + the public scraper log through storage.js, and
// rearranges its own layout on every stat refresh to mitigate OLED/LCD burn-in.
//   • Stats (counts/savings/averages): getLiveFeedStats() on load + hourly.
//   • Scraper feed (run list + live pulse): getScraperLog()+clusterRuns() every 60s.
//   • Each stat refresh advances the burn-in layout + swaps the user panels; a slow
//     timer re-rolls the few-pixel shift. Material changes announced via aria-live.
import { getLiveFeedStats, getScraperLog } from './storage.js';
import { clusterRuns, nextSlot } from './live-feed/runs.js';
import { nextUserOrder, burnShift } from './live-feed/layout.js';

const STATS_MS = 60 * 60 * 1000; // hourly
const FEED_MS = 30 * 1000;       // 30s liveness poll — keeps the feed live while runs write
const SHIFT_MS = 4 * 60 * 1000;  // re-roll the pixel nudge every few minutes
const MAX_RUNS = 18;

const $ = (sel, root = document) => root.querySelector(sel);

// ── Formatters ───────────────────────────────────────────────────────────────
const londonTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtClock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : londonTime.format(d); };
const fmtInt = (n) => Number(n ?? 0).toLocaleString('en-GB');
// Null/undefined = the household hasn't computed its pool yet (no Browse visit
// since deploy) — show an em dash rather than a misleading 0.
const fmtIntOrDash = (n) => (n == null ? '—' : Number(n).toLocaleString('en-GB'));
const fmtMoney = (n) => `£${Number(n ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const fmtAvg = (n) => Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtRel(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ── Small DOM helper (textContent only — never innerHTML for dynamic values) ──
function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-') || k === 'aria-label' || k === 'role') node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const kid of [].concat(kids)) if (kid) node.append(kid);
  return node;
}

// Inline status icons (text label always accompanies them — never colour-only).
function chip(isLive) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 12 12');
  icon.setAttribute('class', 'lf-chip__icon');
  icon.setAttribute('aria-hidden', 'true');
  if (isLive) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '6'); c.setAttribute('cy', '6'); c.setAttribute('r', '5');
    c.setAttribute('fill', 'currentColor');
    icon.append(c);
  } else {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M2.5 6.5 L5 9 L9.5 3.5');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    icon.append(p);
  }
  return el('span', { class: `lf-chip ${isLive ? 'lf-chip--running' : 'lf-chip--done'}` },
    [icon, el('span', { text: isLive ? 'Running' : 'Done' })]);
}

// ── State ────────────────────────────────────────────────────────────────────
const state = { order: ['luke', 'suzanne'], tick: 0, lastReview: {} };

// ── Scraper feed render ───────────────────────────────────────────────────────
function renderRuns(rows) {
  const runs = clusterRuns(rows);
  const list = $('[data-runs]');
  if (list) {
    list.replaceChildren(...runs.slice(0, MAX_RUNS).map((r) => {
      const counts = el('span', { class: 'lf-run__counts' }, [
        el('span', { class: 'lf-count--add', text: `＋${r.added}` }),
        el('span', { text: `~${r.updated}` }),
        el('span', { class: 'lf-count--gone', text: `－${r.removed}` }),
      ]);
      return el('li', { class: 'lf-run' }, [
        el('span', { class: 'lf-run__time', text: fmtClock(r.finishedAt) }),
        chip(r.isLive),
        counts,
      ]);
    }));
  }

  // Liveness pulse + last-write line from the freshest run.
  const live = runs.some((r) => r.isLive);
  const pulse = $('[data-scraper-live]');
  if (pulse) {
    pulse.setAttribute('data-live', String(live));
    $('[data-scraper-live-label]', pulse).textContent = live ? 'Scraping now' : 'Idle';
  }
  const lastWrite = runs[0]?.finishedAt;
  const lw = $('[data-last-write]');
  if (lw) lw.textContent = lastWrite ? fmtRel(lastWrite) : '—';
  return { live, lastWrite };
}

// ── User panels render ────────────────────────────────────────────────────────
const KEY_BY_LABEL = { Luke: 'luke', Suzanne: 'suzanne' };

function userPanel(hh) {
  const stat = (num, label) => el('div', { class: 'lf-stat' }, [
    el('div', { class: 'lf-stat__num', text: num }),
    el('div', { class: 'lf-stat__label', text: label }),
  ]);
  return el('div', { class: 'lf-panel lf-user', 'data-user': KEY_BY_LABEL[hh.label] || hh.label.toLowerCase() }, [
    el('div', { class: 'lf-user__top' }, [
      el('div', { class: 'lf-panel__head' }, [
        el('div', {}, [
          el('p', { class: 'lf-eyebrow', text: 'Household' }),
          el('h2', { class: 'lf-title', text: hh.label }),
        ]),
      ]),
      el('div', { class: 'lf-hero' }, [
        el('div', { class: 'lf-hero__num', text: fmtIntOrDash(hh.to_review) }),
        el('div', { class: 'lf-hero__label', text: 'listings to review' }),
      ]),
    ]),
    el('div', { class: 'lf-stats' }, [
      stat(fmtInt(hh.saved), 'Saved'),
      stat(fmtInt(hh.areas), 'Areas'),
      stat(fmtMoney(hh.savings), 'Savings'),
    ]),
    el('p', { class: 'lf-avgs' }, [
      el('span', { class: 'lf-avg' }, [document.createTextNode('Live in areas '), el('b', { text: fmtInt(hh.live_listings) })]),
      el('span', { class: 'lf-avg' }, [document.createTextNode('Likes/day (7d) '), el('b', { text: fmtAvg(hh.avg_likes_per_day_7) })]),
      el('span', { class: 'lf-avg' }, [document.createTextNode('Likes/week '), el('b', { text: fmtAvg(hh.avg_likes_per_week_4) })]),
    ]),
  ]);
}

function renderUsers(households) {
  const wrap = $('[data-users]');
  if (!wrap) return;
  const byKey = {};
  for (const hh of households || []) byKey[KEY_BY_LABEL[hh.label] || hh.label.toLowerCase()] = hh;
  // Honour the burn-in panel order.
  const panels = state.order.map((k) => byKey[k]).filter(Boolean).map(userPanel);
  wrap.replaceChildren(...panels);
}

// ── Burn-in layout ────────────────────────────────────────────────────────────
function applyShift() {
  const { x, y } = burnShift(state.tick);
  const k = $('.lf-kiosk');
  if (!k) return;
  k.style.setProperty('--lf-shift-x', `${x}px`);
  k.style.setProperty('--lf-shift-y', `${y}px`);
}

// Burn-in step: swap the two stacked user panels (top↔bottom) and re-roll the
// pixel nudge. The layout itself is fixed (U F / U F), so rearranging = reordering
// the users + the shift; renderUsers() then paints them in the new order.
function rearrange() {
  state.order = nextUserOrder(state.order);
  state.tick += 1;
  const k = $('.lf-kiosk');
  if (k) {
    k.classList.add('lf-kiosk--refreshing');
    setTimeout(() => k.classList.remove('lf-kiosk--refreshing'), 450);
  }
  applyShift();
}

function announce(msg) {
  const r = $('[data-live-region]');
  if (!r) return;
  r.textContent = '';
  // Next frame so AT registers the change even on identical text.
  requestAnimationFrame(() => { r.textContent = msg; });
}

// ── Refreshers ────────────────────────────────────────────────────────────────
async function refreshStats({ rearrangeLayout = false } = {}) {
  const stats = await getLiveFeedStats();
  if (!stats) return;
  // Advance the burn-in order BEFORE painting so the swap is visible immediately
  // (the first load keeps the default Luke-top order).
  if (rearrangeLayout) rearrange();
  renderUsers(stats.households);

  const sc = stats.scraper || {};
  const s7 = $('[data-scraper-7d]'); if (s7) s7.textContent = fmtAvg(sc.new_per_day_7);
  const s30 = $('[data-scraper-30d]'); if (s30) s30.textContent = fmtAvg(sc.new_per_day_30);

  // Announce changes in the to-review pool per household.
  const changes = [];
  for (const hh of stats.households || []) {
    const prev = state.lastReview[hh.label];
    const cur = hh.to_review;
    if (prev !== undefined && cur != null && prev !== cur) {
      changes.push(`${hh.label}: ${cur} to review`);
    }
    if (cur != null) state.lastReview[hh.label] = cur;
  }
  if (changes.length) announce(`Updated — ${changes.join('; ')}.`);
}

async function refreshFeed() {
  const rows = await getScraperLog({ sinceDays: 3, limit: 400 });
  const { live } = renderRuns(rows);
  const nf = $('[data-next-fetch]');
  if (nf) nf.textContent = nextSlot().label;
  if (live) announce('Scraper is writing new listings now.');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  applyShift();
  await Promise.all([refreshStats(), refreshFeed()]);
  setInterval(() => refreshStats({ rearrangeLayout: true }), STATS_MS);
  setInterval(refreshFeed, FEED_MS);
  setInterval(() => { state.tick += 1; applyShift(); }, SHIFT_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
