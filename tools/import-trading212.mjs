#!/usr/bin/env node
// import-trading212.mjs — one-shot Trading 212 CSV → JSON aggregator.
//
// Usage:
//   node tools/import-trading212.mjs path/to/export1.csv [path/to/export2.csv ...]
//     [--current-value=34472.19]   declared portfolio value, for impliedGainUnrealised
//     [--out=<path>]               write JSON here (default: stdout only)
//
// PRIVACY (§18.1): the aggregate is USER-STATE — its home is Supabase, never the
// repo. This tool therefore prints to stdout and writes nothing unless --out is
// passed explicitly. data/imports/trading212-history.json is the one sanctioned
// path (gitignored); anything else is the caller's responsibility.

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Columns every T212 export carries, whatever the vintage. `Time` is matched
// loosely because newer exports name it "Time (UTC)".
const REQUIRED_COLUMNS = [
  'Action', 'ISIN', 'Ticker', 'Name', 'ID',
  'No. of shares', 'Price / share', 'Currency (Price / share)',
  'Exchange rate', 'Total', 'Currency (Total)',
];
// Present on older exports only. `Result` carries realised P&L on sells, so an
// export without it cannot contribute realised figures — surfaced as a warning
// rather than a hard failure, since deposits/dividends/positions are still good.
const OPTIONAL_COLUMNS = [
  'Result', 'Currency (Result)', 'Notes',
  'Withholding tax', 'Currency (Withholding tax)',
  'Stamp duty reserve tax', 'Currency (Stamp duty reserve tax)',
];

const DEPOSIT_ACTIONS = new Set(['Deposit']);
const WITHDRAWAL_ACTIONS = new Set(['Withdrawal']);
const BUY_ACTIONS = new Set(['Market buy', 'Limit buy']);
const SELL_ACTIONS = new Set(['Market sell', 'Limit sell']);
const DIVIDEND_ACTIONS = new Set([
  'Dividend (Dividend)',
  'Dividend (Tax exempted)',
  'Dividend (Property income distribution)',
]);
const INTEREST_ACTIONS = new Set(['Interest on cash']);

const EPOCH_BOUNDARIES = [
  { id: 'stockpicker', label: 'Individual UK dividend stocks', start: '2025-05-26', end: '2026-01-01' },
  { id: 'etfCore',    label: 'ETF + gold core (VHYL/VUSA/VEVE/VFEM/SGLN)', start: '2026-01-02', end: null },
];

// ---------------------------------------------------------------------------

async function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = null;
    const rl = createInterface({ input: createReadStream(filePath) });
    rl.on('line', (rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const cols = splitCsvLine(line);
      if (!headers) {
        headers = cols;
        return;
      }
      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
      rows.push(row);
    });
    rl.on('close', () => resolve({ headers, rows }));
    rl.on('error', reject);
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Resolves the header row against what we need, tolerating the naming drift
// between export vintages. Returns the actual key to read the timestamp from —
// "Time" on older exports, "Time (UTC)" on 2026-era ones.
function validateHeaders(headers, filePath) {
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`${filePath}: missing columns: ${missing.join(', ')}`);
  }
  const timeKey = headers.find((h) => h === 'Time' || h.startsWith('Time'));
  if (!timeKey) {
    throw new Error(`${filePath}: no Time column (looked for "Time" / "Time (UTC)")`);
  }
  const absent = OPTIONAL_COLUMNS.filter((c) => !headers.includes(c));
  return { timeKey, absent };
}

function toMonth(timeStr) {
  // T212 format: "2025-12-01 10:30:00"
  return timeStr.slice(0, 7); // YYYY-MM
}

function epochFor(timeStr) {
  const date = timeStr.slice(0, 10); // YYYY-MM-DD
  for (const ep of EPOCH_BOUNDARIES) {
    const afterStart = date >= ep.start;
    const beforeEnd = !ep.end || date <= ep.end;
    if (afterStart && beforeEnd) return ep.id;
  }
  return 'unknown';
}

function num(s) {
  if (!s || s === '') return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round6(n) { return Math.round(n * 1e6) / 1e6; }

function ensureTicker(map, ticker, name, epoch) {
  if (!map.has(ticker)) {
    map.set(ticker, {
      name, netDeployed: 0, epoch,
      shareDelta: 0, dividendAnchors: [], trades: [],
      lastPrice: null, lastPriceDate: null, lastPriceCurrency: null,
    });
  }
  const t = map.get(ticker);
  if (!t.name && name) t.name = name;
  return t;
}

// Typical LSE gap between a fund's ex-dividend date and its pay date. Used only
// to size the ambiguity window below — not as a claim about any specific fund.
const EX_DIV_LAG_DAYS = 21;

/**
 * Turn a dividend anchor into an absolute position at the end of the export
 * window.
 *
 * The subtlety: a dividend row's share count is the holding at the EX-DIVIDEND
 * date, but the row is dated the PAY date, typically ~3 weeks later. Units bought
 * in between earn nothing and so are missing from the count, while being older
 * than the row that reveals it. Adding only the trades dated after the row
 * therefore UNDERSTATES the position by whatever was bought in that window.
 *
 * The CSV cannot tell us where the ex-div date actually fell, so this returns
 * both readings plus the size of the gap between them, and leaves the choice to
 * the caller — who can settle it by checking the implied price against
 * `lastPrice`, or against a statement. It never silently picks one.
 */
function positionFromAnchor(data) {
  const anchors = [...data.dividendAnchors].sort((a, b) => a.date.localeCompare(b.date));
  const anchor = anchors[anchors.length - 1];
  if (!anchor) return { dividendAnchor: null, sharesAtWindowEnd: null };

  const after = (cutoff) => data.trades
    .filter((t) => t.date > cutoff)
    .reduce((s, t) => s + t.shares, 0);

  const exDivCutoff = shiftDate(anchor.date, -EX_DIV_LAG_DAYS);
  const strict = round6(anchor.shares + after(anchor.date));
  const exDivAdjusted = round6(anchor.shares + after(exDivCutoff));

  return {
    dividendAnchor: { date: anchor.date, shares: round6(anchor.shares) },
    // Lower bound: assumes nothing was bought between ex-div and pay date.
    sharesAtWindowEnd: strict,
    // Upper bound: assumes everything in the ~3-week window post-dates ex-div.
    sharesAtWindowEndExDivAdjusted: exDivAdjusted,
    exDivAmbiguityShares: round6(exDivAdjusted - strict),
  };
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Keep the most recent trade price seen for a ticker, normalised to GBP.
// T212 quotes some LSE instruments in GBX (pence) — SGLN is the live example —
// so a naive read overstates those positions 100x.
function recordPrice(t, row, date) {
  const price = num(row['Price / share']);
  if (price <= 0) return;
  if (t.lastPriceDate && date < t.lastPriceDate) return;
  const currency = row['Currency (Price / share)'] || '';
  t.lastPrice = currency === 'GBX' ? round6(price / 100) : price;
  t.lastPriceCurrency = currency;
  t.lastPriceDate = date;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length === 0) {
    console.error('Usage: node tools/import-trading212.mjs path/to/csv1.csv [csv2.csv ...] [--current-value=N] [--out=path]');
    process.exit(1);
  }

  // Validate files exist.
  for (const arg of args) {
    if (!existsSync(arg)) {
      console.error(`File not found: ${arg}`);
      process.exit(1);
    }
  }

  // Parse all CSVs and merge rows, deduplicating by ID.
  const allRowsById = new Map();

  for (const csvPath of args) {
    console.log(`Parsing: ${csvPath}`);
    const { headers, rows } = await parseCsv(csvPath);
    let timeKey;
    try {
      const resolved = validateHeaders(headers, csvPath);
      timeKey = resolved.timeKey;
      if (resolved.absent.includes('Result')) {
        console.warn('  ⚠ no "Result" column — realised P&L cannot be read from this export');
      }
    } catch (e) {
      console.error(`Column validation failed: ${e.message}`);
      process.exit(1);
    }
    console.log(`  ${rows.length} rows found (timestamp column: "${timeKey}")`);
    for (const row of rows) {
      const id = row['ID'];
      // Normalise the timestamp onto a single key so downstream code never has
      // to know which export vintage a row came from.
      row._time = row[timeKey] ?? '';
      // Use ID as dedup key when present; fall back to a composite key to avoid losing rows.
      const key = id || `${row._time}|${row['Action']}|${row['Total']}`;
      if (!allRowsById.has(key)) {
        allRowsById.set(key, row);
      }
    }
  }

  const allRows = [...allRowsById.values()];
  console.log(`\nTotal unique transactions: ${allRows.length}`);

  // --- Aggregate ---
  const monthlyMap = new Map(); // YYYY-MM → {deposits, withdrawals, net, dividends, interest, realisedPnL}
  const tickerMap = new Map();  // ticker → {name, buys, sells, epoch}

  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let totalDividends = 0;
  let totalInterest = 0;
  let totalRealisedPnL = 0;

  let dateMin = null;
  let dateMax = null;

  for (const row of allRows) {
    const action = row['Action'];
    const time = row._time;
    if (!time) continue;

    const month = toMonth(time);
    const date = time.slice(0, 10);
    if (!dateMin || date < dateMin) dateMin = date;
    if (!dateMax || date > dateMax) dateMax = date;

    const ep = epochFor(time);

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, deposits: 0, withdrawals: 0, net: 0, dividends: 0, interest: 0, realisedPnL: 0, epoch: ep });
    }
    const mo = monthlyMap.get(month);

    const total = num(row['Total']);
    const result = num(row['Result']);

    if (DEPOSIT_ACTIONS.has(action)) {
      const amount = Math.abs(total);
      mo.deposits = round2(mo.deposits + amount);
      totalDeposited = round2(totalDeposited + amount);
    } else if (WITHDRAWAL_ACTIONS.has(action)) {
      const amount = Math.abs(total);
      mo.withdrawals = round2(mo.withdrawals + amount);
      totalWithdrawn = round2(totalWithdrawn + amount);
    } else if (BUY_ACTIONS.has(action)) {
      const ticker = row['Ticker'];
      const name = row['Name'];
      const cost = Math.abs(total);
      if (ticker) {
        const t = ensureTicker(tickerMap, ticker, name, ep);
        t.netDeployed = round2(t.netDeployed + cost);
        // Share deltas + the last observed price are what let a caller value the
        // position at the export's end date without a separate statement.
        t.shareDelta += num(row['No. of shares']);
        t.trades.push({ date, shares: num(row['No. of shares']) });
        recordPrice(t, row, date);
        if (t.epoch !== ep) t.epoch = 'both';
      }
    } else if (SELL_ACTIONS.has(action)) {
      const ticker = row['Ticker'];
      const proceeds = Math.abs(total);
      const pnl = result; // Result column = realised gain/loss on sells
      mo.realisedPnL = round2(mo.realisedPnL + pnl);
      totalRealisedPnL = round2(totalRealisedPnL + pnl);
      if (ticker) {
        const t = ensureTicker(tickerMap, ticker, row['Name'], ep);
        t.netDeployed = round2(t.netDeployed - proceeds);
        t.shareDelta -= num(row['No. of shares']);
        t.trades.push({ date, shares: -num(row['No. of shares']) });
        recordPrice(t, row, date);
      }
    } else if (DIVIDEND_ACTIONS.has(action)) {
      const amount = Math.abs(total);
      mo.dividends = round2(mo.dividends + amount);
      totalDividends = round2(totalDividends + amount);
      // A dividend row states the shares that earned it — an ABSOLUTE position
      // count at the ex-dividend date, and the only anchor in the file that does
      // not depend on knowing the balance before the export window. Shares bought
      // after the ex-div date are excluded from it, so treat it as a floor.
      const ticker = row['Ticker'];
      if (ticker) {
        const t = ensureTicker(tickerMap, ticker, row['Name'], ep);
        const shares = num(row['No. of shares']);
        if (shares > 0) t.dividendAnchors.push({ date, shares });
      }
    } else if (INTEREST_ACTIONS.has(action)) {
      const amount = Math.abs(total);
      mo.interest = round2(mo.interest + amount);
      totalInterest = round2(totalInterest + amount);
    }
    // Stock split, distribution etc — no cash movement, skip.
  }

  // Compute net for each month.
  for (const mo of monthlyMap.values()) {
    mo.net = round2(mo.deposits - mo.withdrawals);
  }

  // Sort monthly summary ascending.
  const monthlySummary = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Build ticker exposure. `shareDelta` is the CHANGE in units across the export
  // window, not the holding — an export that starts mid-life knows nothing about
  // the units already held. `sharesAtWindowEnd` is the real holding, and is only
  // populated when a dividend anchor lets us pin the absolute count.
  const tickerExposure = {};
  for (const [ticker, data] of tickerMap.entries()) {
    tickerExposure[ticker] = {
      name: data.name,
      netDeployed: round2(data.netDeployed),
      epoch: data.epoch,
      shareDelta: round6(data.shareDelta),
      lastPrice: data.lastPrice,
      lastPriceDate: data.lastPriceDate,
      lastPriceCurrency: data.lastPriceCurrency,
      ...positionFromAnchor(data),
    };
  }

  // Build epoch summaries.
  const epochs = {};
  for (const ep of EPOCH_BOUNDARIES) {
    const monthsInEpoch = monthlySummary.filter((m) => {
      const afterStart = m.month >= ep.start.slice(0, 7);
      const beforeEnd = !ep.end || m.month <= ep.end.slice(0, 7);
      return afterStart && beforeEnd;
    });
    const contributed = round2(monthsInEpoch.reduce((s, m) => s + m.net, 0));
    const tickers = [...tickerMap.entries()]
      .filter(([, d]) => d.epoch === ep.id || d.epoch === 'both')
      .map(([t]) => t);
    epochs[ep.id] = {
      start: ep.start,
      end: ep.end,
      totalContributedDuring: contributed,
      tickersHeld: tickers,
    };
  }

  const netContributed = round2(totalDeposited - totalWithdrawn);

  // Read current declared value for impliedGainUnrealised.
  // Pass --current-value=XXXXX for the real portfolio value; falls back to sample fixture for dry runs.
  let currentValueDeclared = 0;
  const currentValueArg = process.argv.find(a => a.startsWith('--current-value='));
  if (currentValueArg) {
    currentValueDeclared = parseFloat(currentValueArg.split('=')[1]) || 0;
  } else {
    try {
      const inv = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/fixtures/investments.sample.json'), 'utf8'));
      currentValueDeclared = Number(inv?.trading212ISA?.currentPortfolioValue) || 0;
      if (currentValueDeclared) console.warn('⚠ Using sample fixture value. Pass --current-value=XXXXX for real portfolio value.');
    } catch { /* ignore */ }
  }

  const impliedGainUnrealised = round2(currentValueDeclared - netContributed - totalDividends - totalInterest - totalRealisedPnL);

  const output = {
    _status: 'imported',
    source: `Trading 212 history export${args.length > 1 ? ` (${args.length} files merged)` : ''}`,
    importedAt: new Date().toISOString(),
    dateRange: { from: dateMin ?? '', to: dateMax ?? '' },
    summary: {
      totalDeposited,
      totalWithdrawn,
      netContributed,
      totalDividends,
      totalInterest,
      totalRealisedPnL,
      currentValueDeclared,
      impliedGainUnrealised,
    },
    monthlySummary,
    tickerExposure,
    epochs,
  };

  // Print summary table.
  console.log('\n--- Summary ---');
  console.log(`Date range:        ${dateMin} → ${dateMax}`);
  console.log(`Total deposited:   £${totalDeposited.toFixed(2)}`);
  console.log(`Total withdrawn:   £${totalWithdrawn.toFixed(2)}`);
  console.log(`Net contributed:   £${netContributed.toFixed(2)}`);
  console.log(`Dividends:         £${totalDividends.toFixed(2)}`);
  console.log(`Interest:          £${totalInterest.toFixed(2)}`);
  console.log(`Realised P&L:      £${totalRealisedPnL.toFixed(2)}`);
  console.log(`Current value:     £${currentValueDeclared.toFixed(2)} (from investments.json)`);
  console.log(`Implied unreal.:   £${impliedGainUnrealised.toFixed(2)}`);
  console.log(`\nMonths covered: ${monthlySummary.length}`);
  console.log(`Unique tickers:  ${Object.keys(tickerExposure).length}`);

  console.log('\nMonthly breakdown:');
  console.log('Month      | Deposits  | Net       | Dividends | Interest | P&L    | Epoch');
  console.log('---------- | --------- | --------- | --------- | -------- | ------ | ----------');
  for (const mo of monthlySummary) {
    console.log(
      `${mo.month} | ${pad(mo.deposits)} | ${pad(mo.net)} | ${pad(mo.dividends)} | ${pad(mo.interest)} | ${pad(mo.realisedPnL)} | ${mo.epoch}`
    );
  }

  console.log('\nPositions (units are a DELTA over the window unless anchored):');
  console.log('Ticker | Δ units      | Anchored units | Last price | On         | Value @ last');
  console.log('------ | ------------ | -------------- | ---------- | ---------- | ------------');
  for (const [ticker, t] of Object.entries(tickerExposure)) {
    const units = t.sharesAtWindowEndExDivAdjusted ?? t.sharesAtWindowEnd;
    const value = units != null && t.lastPrice != null ? `£${round2(units * t.lastPrice).toFixed(2)}` : '—';
    console.log(
      `${ticker.padEnd(6)} | ${String(t.shareDelta.toFixed(6)).padStart(12)} | ` +
      `${String(units != null ? units.toFixed(6) : '—').padStart(14)} | ` +
      `${String(t.lastPrice != null ? t.lastPrice.toFixed(4) : '—').padStart(10)} | ` +
      `${(t.lastPriceDate ?? '—').padEnd(10)} | ${value.padStart(12)}`
    );
    if (t.exDivAmbiguityShares) {
      console.log(`       ↳ ex-div window is ambiguous by ${t.exDivAmbiguityShares.toFixed(6)} units — ` +
        `check the implied price against ${t.lastPrice?.toFixed(4) ?? 'a statement'} before trusting either bound`);
    }
  }

  // §18.1: this aggregate is user-state. Writing it into the repo is opt-in and
  // never the default, so a routine run cannot leave financial data on disk.
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  if (outArg) {
    const outPath = resolve(outArg.slice('--out='.length));
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`\nWritten to: ${outPath}`);
    if (!outPath.includes('data/imports/')) {
      console.warn('⚠ This file contains user-state financial data — keep it out of git.');
    }
  } else {
    console.log('\n(no --out given — nothing written to disk; the destination is Supabase, see CLAUDE.md §18.1)');
  }
}

function pad(n) {
  return String(n.toFixed(2)).padStart(9);
}

main().catch((e) => { console.error(e); process.exit(1); });
