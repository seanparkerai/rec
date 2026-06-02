// Shared mutable state for the outreach page. All modules read/write this object.
export const state = {
  templates: [],
  profile: null,
  criteria: null,
  finances: null,
  contacts: { agents: [], brokers: [], solicitors: [], surveyors: [] },
  logEntries: [],
  activeTemplate: null,
  activeStage: '',
  activeRole: '',
  _returnFocus: null,
};

export const ROLE_LABELS = {
  'estate-agent': 'Estate agent',
  'mortgage-broker': 'Mortgage broker',
  'solicitor': 'Solicitor',
  'surveyor': 'Surveyor',
  'vendor': 'Vendor',
  'local-authority': 'Local authority',
  'removals': 'Removals',
  'insurance': 'Insurance',
};

export const STAGE_LABELS = {
  A: 'Search',
  B: 'Offer',
  C: 'Post-acceptance',
  D: 'Pre-completion',
};
