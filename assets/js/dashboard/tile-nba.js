// tile-nba.js — v3 L5 Next-Best-Action strip above the dashboard bento.
// Self-contained: loads the listing/reaction/status state it needs, scores with
// the same fit engine + learned weights the listings page uses, and renders an
// ordered, timestamp/count-driven list of the most useful next moves. No new
// black box — every action is a plain count with a destination.
import {
  getListings, getListingReactions, getShortlistStatuses,
  getFinances, getCriteria, getLearnedPreferences,
} from '../storage.js';
import { deriveFinances } from '../finance-derive.js';
import { scoreListingFit } from '../listing-fit.js';
import { effectiveWeights, listingLearnedPrefs } from '../learned-preferences.js';
import { computeNextBestActions } from '../meta-observations.js';
import { url } from '../config.js';
import { el, clear, byId } from '../dom.js';

export async function renderNba(mountId = 'nba-strip') {
  const mount = byId(mountId);
  if (!mount) return;
  try {
    const [listings, reactions, statuses, rawFinances, criteria, learned] = await Promise.all([
      getListings({ limit: 200 }), getListingReactions(), getShortlistStatuses(),
      getFinances(), getCriteria(), getLearnedPreferences(),
    ]);
    const finances = rawFinances ? deriveFinances(rawFinances) : null;
    const effective = effectiveWeights(learned?.derived || {}, learned?.overrides || {});
    const scoreOf = (l) => (finances
      ? scoreListingFit({ listing: l, finances, criteria, area: null, learnedPrefs: listingLearnedPrefs(l, effective) })
      : { verdict: 'unknown', gated: false });

    const actions = computeNextBestActions({ reactions, listings, statuses, scoreOf, now: new Date() });
    clear(mount);
    if (!actions.length) { mount.hidden = true; return; }
    mount.hidden = false;
    mount.appendChild(el('h2', { class: 'nba-strip__label' }, 'Next best actions'));
    mount.appendChild(el('ul', { class: 'nba-list' }, actions.map((a) =>
      el('li', { class: 'nba-item' }, [
        el('a', { class: 'nba-item__link', href: url(a.href) }, [
          el('span', { class: 'nba-item__text' }, a.text),
          el('span', { class: 'nba-item__cta', 'aria-hidden': 'true' }, '→'),
        ]),
      ]),
    )));
  } catch (e) {
    console.error('nba tile', e);
    mount.hidden = true;
  }
}
