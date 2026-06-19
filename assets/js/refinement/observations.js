// refinement/observations.js — the "Trends & nudges" lane (2026-06-19). PURE, no DOM/IO.
//
// A LOWER-STAKES companion to the statistically-gated suggestion inbox: short,
// plain-English observations that surface more regularly and never change anything by
// themselves. They are notify-only and dismissible. Sources are all things the app
// already computes — nothing new is measured here, it is composed:
//   • reactionMix / topDrivers / coverage  (refinement/trends-glance.js)
//   • the engine's `forming` bucket          (classifySuggestions groups)
// The high-stakes "stop searching / hide" actions stay in the inbox; the live
// criteria conflicts (over-budget, excluded-type…) stay there too — this lane is
// deliberately the calm, affirming read on where the user's taste is heading.
import { reactionMix, topDrivers, coverage } from './trends-glance.js';

/** A reaction-count floor below which the affirming observations are noise, not signal. */
const MIN_GRADED_FOR_TRENDS = 12;

const pct = (n) => `${Math.round(n)}%`;

/**
 * Build the notify-only observation cards. Pure: pass the same data the refinement page
 * already loads. Dismissed observations (their `obs:<id>` key present + not elapsed in the
 * dismissals map) are filtered out, so a dismissal sticks.
 *
 * @param {object} args
 * @param {Array}  args.reactionLog   full reaction log (provenance-aware helpers strip sweeps)
 * @param {object} args.prefs         learned_preferences row ({ derived, overrides, dismissals })
 * @param {object} args.criteria      saved search criteria
 * @param {object} args.groups        classifySuggestions() output (for the forming digest)
 * @param {Date}   [args.now]
 * @returns {Array<{id,kind,tone,title,detail}>}  tone ∈ 'positive'|'neutral'|'watch'
 */
export function buildObservations({ reactionLog = [], prefs = {}, criteria = {}, groups = {}, now = new Date() } = {}) {
  const derived = prefs?.derived || {};
  const dismissals = prefs?.dismissals || {};
  const out = [];

  const mix = reactionMix(reactionLog);
  const graded = mix.liked + mix.rejected;

  // 1. Keep-rate — the honest headline once there's enough genuine signal.
  if (graded >= MIN_GRADED_FOR_TRENDS) {
    const likePct = graded ? (mix.liked / graded) * 100 : 0;
    out.push({
      id: 'keep-rate',
      kind: 'keep-rate',
      tone: 'neutral',
      title: `You like ${pct(likePct)} of the homes you judge`,
      detail: `${mix.liked} kept and ${mix.rejected} rejected across ${mix.total} homes reviewed one at a time. A selective eye is good — it sharpens what the engine learns.`,
    });
  }

  // 2 & 3. Strongest pull / biggest turn-off — affirming reads on the learned drivers.
  const drivers = topDrivers(derived, 6);
  const pull = drivers.find((d) => d.weight > 0);
  const turnOff = drivers.find((d) => d.weight < 0);
  if (pull) {
    out.push({
      id: `pull:${pull.signal}`,
      kind: 'driver-like',
      tone: 'positive',
      title: `Your strongest pull is ${pull.label}`,
      detail: `Across ${pull.n_liked} likes this is the attribute most associated with the homes you keep.`,
    });
  }
  if (turnOff) {
    out.push({
      id: `turnoff:${turnOff.signal}`,
      kind: 'driver-reject',
      tone: 'watch',
      title: `Your biggest turn-off is ${turnOff.label}`,
      detail: `It shows up across ${turnOff.n_rejected} rejections — worth reflecting in your search criteria.`,
    });
  }

  // 4. Coverage gap — types searched but never liked.
  const never = coverage(criteria, derived).filter((c) => !c.liked).map((c) => c.type);
  if (never.length) {
    out.push({
      id: `coverage:${never.join(',').toLowerCase()}`,
      kind: 'coverage-gap',
      tone: 'watch',
      title: `Searched but never liked: ${never.join(', ')}`,
      detail: `You're searching for ${never.length === 1 ? 'a type' : 'types'} you've never actually kept a home in. Narrowing your criteria could cut the noise.`,
    });
  }

  // 5. Forming digest — a gentle heads-up about patterns building toward a suggestion.
  const forming = Array.isArray(groups?.forming) ? groups.forming : [];
  if (forming.length) {
    const names = forming.slice(0, 3).map((c) => c.label).join(', ');
    out.push({
      id: 'forming-digest',
      kind: 'forming-digest',
      tone: 'neutral',
      title: `${forming.length} pattern${forming.length === 1 ? '' : 's'} forming`,
      detail: `Building toward a suggestion: ${names}${forming.length > 3 ? '…' : ''}. Keep reacting and the strongest will surface in your inbox.`,
    });
  }

  return out.filter((o) => !isDismissed(o.id, dismissals, now));
}

/** The dismissals-map key an observation is stored under (parallels the conflict keys). */
export function observationDismissKey(id) {
  return `obs:${id}`;
}

/** Whether an observation has a live (not-yet-elapsed) dismissal in the map. A dismissal
 *  entry is either a legacy ISO string or the richer { kind, until } form (same shape the
 *  live-conflict dismissals use), so tolerate both. */
export function isDismissed(id, dismissals = {}, now = new Date()) {
  const v = dismissals?.[observationDismissKey(id)];
  if (!v) return false;
  const iso = typeof v === 'object' ? v.until : v;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > now.getTime();
}
