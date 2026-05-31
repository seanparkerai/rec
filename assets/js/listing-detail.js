// listing-detail.js — pure helpers for the v3 L6 per-listing dossier. No DOM, no
// DB, no fetch. Imported by assets/js/page-property.js and tests/listing-detail.test.js.

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//.test(u);

/**
 * Ordered, de-duplicated gallery image URLs for a listing. Reads the rich
 * raw_json.images[] (each { url, caption }) and falls back to the single
 * image_url; the primary image_url is guaranteed to appear (deduped).
 * @param {object} listing  a listings row (with raw_json)
 * @returns {string[]}
 */
export function galleryImages(listing) {
  const out = [];
  const seen = new Set();
  const push = (u) => { if (isHttp(u) && !seen.has(u)) { seen.add(u); out.push(u); } };
  const imgs = listing?.raw_json?.images;
  if (Array.isArray(imgs)) for (const im of imgs) push(typeof im === 'string' ? im : im?.url);
  push(listing?.image_url); // ensure the primary is present (deduped if already there)
  return out;
}

/**
 * Normalise a price_history array ({ date:'YYYY-MM-DD', price:Number }) into a
 * time-ascending series with per-step deltas. The first point is the original
 * listing price (kind 'listed'); subsequent points are 'reduced' / 'increased' /
 * 'unchanged' with the £ and fractional change from the previous point.
 * @param {Array} priceHistory
 * @returns {Array<{ date, price, delta, pct, kind }>}
 */
export function priceHistorySeries(priceHistory) {
  const arr = (Array.isArray(priceHistory) ? priceHistory : [])
    .filter((e) => e && e.price != null && e.date)
    .map((e) => ({ date: String(e.date), price: Number(e.price) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return arr.map((e, i) => {
    if (i === 0) return { ...e, delta: 0, pct: 0, kind: 'listed' };
    const prev = arr[i - 1].price;
    const delta = e.price - prev;
    const pct = prev ? delta / prev : 0;
    return { ...e, delta, pct, kind: delta < 0 ? 'reduced' : delta > 0 ? 'increased' : 'unchanged' };
  });
}

/** Net £ change across the whole series (last − first); 0 for a single point. */
export function netPriceChange(series) {
  if (!Array.isArray(series) || series.length < 2) return 0;
  return series[series.length - 1].price - series[0].price;
}
