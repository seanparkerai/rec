import { gbp, gbpPence } from '../format.js';
import { esc, byId as $, setText } from '../dom.js';

function sumNumeric(arr, key) {
  return (arr || []).reduce((s, x) => s + (Number(x[key]) || 0), 0);
}

function sparkbar(value, max) {
  if (!max || max <= 0) return '';
  const pct = Math.min(100, Math.max(0, (Number(value) / max) * 100));
  return `<span class="sparkbar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span>`;
}

function renderTable(targetId, rows, columns, totals = null, sparkColumnKey = null, sparkMax = null) {
  const el = $(targetId);
  if (!el) return;
  if (!rows?.length) { el.innerHTML = `<p class="muted">None.</p>`; return; }
  const head = columns.map((c) => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `
    <tr>${columns.map((c) => {
      const v = c.get(r);
      const formatted = c.format ? c.format(v) : (v ?? '');
      const isSparkCol = (sparkColumnKey && c.key === sparkColumnKey);
      const spark = isSparkCol ? sparkbar(v, sparkMax) : '';
      return `<td${c.numeric ? ' class="num"' : ''}>${esc(formatted)}${spark}</td>`;
    }).join('')}</tr>
  `).join('');
  const foot = totals ? `<tfoot><tr>${columns.map((c) => `<td${c.numeric ? ' class="num"' : ''}><strong>${esc(totals[c.key] ?? '')}</strong></td>`).join('')}</tr></tfoot>` : '';
  el.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

export function renderBreakdowns(finData) {
  const billsAnnual = sumNumeric(finData.ongoingBills, 'annual');
  const billsMonthly = sumNumeric(finData.ongoingBills, 'monthly');
  const billsMax = Math.max(...(finData.ongoingBills || []).map((b) => Number(b.monthly) || 0), 1);
  renderTable('tbl-bills', finData.ongoingBills, [
    { label: 'Bill', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbpPence(v), numeric: true, key: 'monthly' },
  ], { item: 'Total', annual: gbp(billsAnnual), monthly: gbpPence(billsMonthly) }, 'monthly', billsMax);

  const expAnnual = sumNumeric(finData.expenses, 'annual');
  const expMonthly = sumNumeric(finData.expenses, 'monthly');
  const expWeekly = sumNumeric(finData.expenses, 'weekly');
  const expMax = Math.max(...(finData.expenses || []).map((b) => Number(b.monthly) || 0), 1);
  renderTable('tbl-expenses', finData.expenses, [
    { label: 'Expense', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbp(v), numeric: true, key: 'monthly' },
    { label: 'Weekly', get: (r) => r.weekly, format: (v) => gbpPence(v), numeric: true, key: 'weekly' },
  ], { item: 'Total', annual: gbp(expAnnual), monthly: gbp(expMonthly), weekly: gbpPence(expWeekly) }, 'monthly', expMax);

  const oneTimeTotal = sumNumeric(finData.oneTimeCosts, 'cost');
  const oneMax = Math.max(...(finData.oneTimeCosts || []).map((b) => Number(b.cost) || 0), 1);
  renderTable('tbl-onetime', finData.oneTimeCosts, [
    { label: 'Item', get: (r) => r.item, key: 'item' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Notes', get: (r) => r.notes, key: 'notes' },
  ], { item: 'Total', cost: gbp(oneTimeTotal), notes: '' }, 'cost', oneMax);
  setText('onetime-total', gbp(oneTimeTotal));

  const shopTotal = sumNumeric(finData.shoppingList, 'cost');
  const shopMax = Math.max(...(finData.shoppingList || []).map((b) => Number(b.cost) || 0), 1);
  renderTable('tbl-shopping', finData.shoppingList, [
    { label: 'Category', get: (r) => r.category, key: 'category' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Items', get: (r) => r.items, key: 'items' },
  ], { category: 'Total', cost: gbp(shopTotal), items: '' }, 'cost', shopMax);
  setText('shopping-total', gbp(shopTotal));

  const giftTotal = sumNumeric(finData.giftCards, 'amount');
  const giftMax = Math.max(...(finData.giftCards || []).map((b) => Number(b.amount) || 0), 1);
  renderTable('tbl-giftcards', finData.giftCards, [
    { label: 'Source', get: (r) => r.source, key: 'source' },
    { label: 'Amount', get: (r) => r.amount, format: (v) => gbp(v), numeric: true, key: 'amount' },
    { label: 'Expiry', get: (r) => r.expiry || '—', key: 'expiry' },
  ], { source: 'Total', amount: gbp(giftTotal), expiry: '' }, 'amount', giftMax);
  setText('giftcards-total', gbp(giftTotal));
}
