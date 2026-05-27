// flow-constants.js — palette key names shared between the dashboard money-flow
// tile (page-home.js) and the finances money-flow tile (page-finances.js).

/** CSS class suffix for each money-flow segment. Matches dashboard.css selectors. */
export const FLOW_PALETTE = {
  bills:    'bills',
  expenses: 'expenses',
  savings:  'savings',
  mortgage: 'mortgage',
  spare:    'spare',
};

/** Stable segment order for stacked-bar rendering (left → right). */
export const FLOW_ORDER = ['bills', 'expenses', 'savings', 'mortgage', 'spare'];
