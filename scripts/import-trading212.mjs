#!/usr/bin/env node
// import-trading212.mjs — one-shot Trading 212 CSV → JSON aggregator.
//
// Usage:
//   node scripts/import-trading212.mjs path/to/export1.csv [path/to/export2.csv ...]
//
// Writes to: data/imports/trading212-history.json

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(REPO_ROOT, 'data/imports/trading212-history.json');

// Column names exactly as T212 exports them.
const EXPECTED_COLUMNS = [
  'Action', 'Time', 'ISIN', 'Ticker', 'Name', 'Notes', 'ID',
  'No. of shares', 'Price / share', 'Currency (Price / share)',
  'Exchange rate', 'Result', 'Currency (Result)',
  'Total', 'Currency (Total)',
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

function validateHeaders(headers, filePath) {
  const missing = EXPECTED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`${filePath}: missing columns: ${missing.join(', ')}`);
  }
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

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/import-trading212.mjs path/to/csv1.csv [csv2.csv ...]');
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
    try {
      validateHeaders(headers, csvPath);
    } catch (e) {
      console.error(`Column validation failed: ${e.message}`);
      process.exit(1);
    }
    console.log(`  ${rows.length} rows found`);
    for (const row of rows) {
      const id = row['ID'];
      // Use ID as dedup key when present; fall back to a composite key to avoid losing rows.
      const key = id || `${row['Time']}|${row['Action']}|${row['Total']}`;
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
    const time = row['Time'];
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
        if (!tickerMap.has(ticker)) tickerMap.set(ticker, { name, netDeployed: 0, epoch: ep });
        const t = tickerMap.get(ticker);
        t.netDeployed = round2(t.netDeployed + cost);
        if (t.epoch !== ep) t.epoch = 'both';
      }
    } else if (SELL_ACTIONS.has(action)) {
      const ticker = row['Ticker'];
      const proceeds = Math.abs(total);
      const pnl = result; // Result column = realised gain/loss on sells
      mo.realisedPnL = round2(mo.realisedPnL + pnl);
      totalRealisedPnL = round2(totalRealisedPnL + pnl);
      if (ticker && tickerMap.has(ticker)) {
        tickerMap.get(ticker).netDeployed = round2(tickerMap.get(ticker).netDeployed - proceeds);
      }
    } else if (DIVIDEND_ACTIONS.has(action)) {
      const amount = Math.abs(total);
      mo.dividends = round2(mo.dividends + amount);
      totalDividends = round2(totalDividends + amount);
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

  // Build ticker exposure.
  const tickerExposure = {};
  for (const [ticker, data] of tickerMap.entries()) {
    tickerExposure[ticker] = {
      name: data.name,
      netDeployed: round2(data.netDeployed),
      epoch: data.epoch,
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

  // Read current declared value from investments.json for impliedGainUnrealised.
  let currentValueDeclared = 0;
  try {
    const inv = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/investments.json'), 'utf8'));
    currentValueDeclared = Number(inv?.trading212ISA?.currentPortfolioValue) || 0;
  } catch { /* ignore */ }

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

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
}

function pad(n) {
  return String(n.toFixed(2)).padStart(9);
}

main().catch((e) => { console.error(e); process.exit(1); });
