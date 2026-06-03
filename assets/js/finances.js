// finances.js — re-export shim (REFACTOR P9). The pure UK-FTB calculators were split
// into finances/calc-{purchase,lisa,savings,outlay}.js; this file preserves the exact
// 10-function public surface so named imports and `import * as fin` consumers are
// unchanged. Per §16, finances.js is split behind a byte-identical shim, never rewritten.
export * from './finances/calc-purchase.js';
export * from './finances/calc-lisa.js';
export * from './finances/calc-savings.js';
export * from './finances/calc-outlay.js';
