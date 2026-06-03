// listings-labels.test.js — shared display-label dictionaries de-duplicated from
// page-listings.js / page-property.js into ./listings/labels.js (REFACTOR P7f).
// Guards against a key being added to a status/verdict enum without a matching label.
import { VERDICT_LABELS, STATUS_LABELS, PERSONAL_STATUS_LABELS } from '../assets/js/listings/labels.js';
import { PERSONAL_STATUSES } from '../assets/js/listings/reactions.js';

export async function register({ test, assert, assertEqual }) {
  test('listings/labels: VERDICT_LABELS covers every fit verdict', () => {
    for (const k of ['strong', 'possible', 'stretch', 'weak', 'reject', 'unknown']) {
      assert(typeof VERDICT_LABELS[k] === 'string' && VERDICT_LABELS[k].length > 0, `missing verdict label: ${k}`);
    }
    assertEqual(VERDICT_LABELS.strong, 'Strong match');
    assertEqual(VERDICT_LABELS.unknown, 'Unscored');
  });

  test('listings/labels: STATUS_LABELS covers every market status', () => {
    for (const k of ['live', 'under_offer', 'sstc', 'withdrawn']) {
      assert(typeof STATUS_LABELS[k] === 'string' && STATUS_LABELS[k].length > 0, `missing status label: ${k}`);
    }
    assertEqual(STATUS_LABELS.live, 'For sale');
  });

  test('listings/labels: PERSONAL_STATUS_LABELS covers every PERSONAL_STATUSES key', () => {
    for (const k of PERSONAL_STATUSES) {
      assert(typeof PERSONAL_STATUS_LABELS[k] === 'string' && PERSONAL_STATUS_LABELS[k].length > 0,
        `missing personal-status label: ${k}`);
    }
  });
}
