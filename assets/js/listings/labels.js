// listings/labels.js — canonical display-label dictionaries for a listing's fit
// verdict, market status, and personal (shortlist) status (REFACTOR P7f).
// page-listings.js and page-property.js previously each defined byte-identical
// copies of these three maps; both now import from here so the wording has a
// single source of truth. Pure data — no DOM, no logic.

// Fit verdict → human label (keys match scoreListingFit's verdict values).
export const VERDICT_LABELS = {
  strong: 'Strong match',
  possible: 'Possible match',
  stretch: 'Stretch',
  weak: 'Weak match',
  reject: 'Reject',
  unknown: 'Unscored',
};

// Market status → human label (keys match the listing.status field).
export const STATUS_LABELS = {
  live: 'For sale',
  under_offer: 'Under offer',
  sstc: 'Sold STC',
  withdrawn: 'Withdrawn',
};

// Personal/shortlist status → human label (keys match PERSONAL_STATUSES in reactions.js).
export const PERSONAL_STATUS_LABELS = {
  new: 'New',
  saved: 'Saved',
  viewed: 'Viewed',
  offered: 'Offered',
  rejected: 'Rejected',
};
