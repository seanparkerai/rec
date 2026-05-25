// schemas.js — tiny JSON shape validators. Each returns an array of error strings ([] = valid).
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

function check(errors, cond, msg) { if (!cond) errors.push(msg); }

export function validateProfile(o) {
  const e = [];
  check(e, typeOf(o) === 'object', 'profile must be an object');
  if (typeOf(o) !== 'object') return e;
  check(e, typeOf(o.priorities) === 'array', 'profile.priorities must be an array');
  check(e, typeOf(o.dealBreakers) === 'array', 'profile.dealBreakers must be an array');
  check(e, 'locationFocus' in o, 'profile.locationFocus missing');
  return e;
}

export function validateCriteria(o) {
  const e = [];
  check(e, typeOf(o) === 'object', 'criteria must be an object');
  if (typeOf(o) !== 'object') return e;
  check(e, typeOf(o.budget) === 'object', 'criteria.budget must be an object');
  check(e, typeof o.budget?.max === 'number', 'criteria.budget.max must be a number');
  check(e, typeOf(o.size) === 'object', 'criteria.size must be an object');
  check(e, typeOf(o.propertyTypes) === 'array', 'criteria.propertyTypes must be an array');
  check(e, typeOf(o.mustHaves) === 'array', 'criteria.mustHaves must be an array');
  check(e, typeOf(o.niceToHaves) === 'array', 'criteria.niceToHaves must be an array');
  if ('location' in o) check(e, typeOf(o.location) === 'object', 'criteria.location must be an object');
  if ('propertyTypePrefs' in o) {
    check(e, typeOf(o.propertyTypePrefs) === 'object', 'criteria.propertyTypePrefs must be an object');
    check(e, typeOf(o.propertyTypePrefs?.preferred) === 'array', 'criteria.propertyTypePrefs.preferred must be an array');
    check(e, typeOf(o.propertyTypePrefs?.acceptable) === 'array', 'criteria.propertyTypePrefs.acceptable must be an array');
    check(e, typeOf(o.propertyTypePrefs?.excluded) === 'array', 'criteria.propertyTypePrefs.excluded must be an array');
  }
  if ('tenure' in o) {
    check(e, typeOf(o.tenure) === 'object', 'criteria.tenure must be an object');
    check(e, typeOf(o.tenure?.preferred) === 'array', 'criteria.tenure.preferred must be an array');
    check(e, typeOf(o.tenure?.excluded) === 'array', 'criteria.tenure.excluded must be an array');
  }
  if ('propertyStatus' in o) {
    check(e, typeOf(o.propertyStatus) === 'object', 'criteria.propertyStatus must be an object');
    check(e, typeOf(o.propertyStatus?.include) === 'array', 'criteria.propertyStatus.include must be an array');
    check(e, typeOf(o.propertyStatus?.exclude) === 'array', 'criteria.propertyStatus.exclude must be an array');
  }
  if ('features' in o) {
    check(e, typeOf(o.features) === 'object', 'criteria.features must be an object');
    check(e, typeOf(o.features?.mustHave) === 'array', 'criteria.features.mustHave must be an array');
    check(e, typeOf(o.features?.niceToHave) === 'array', 'criteria.features.niceToHave must be an array');
  }
  if ('keywords' in o) {
    check(e, typeOf(o.keywords) === 'object', 'criteria.keywords must be an object');
    check(e, typeOf(o.keywords?.include) === 'array', 'criteria.keywords.include must be an array');
    check(e, typeOf(o.keywords?.exclude) === 'array', 'criteria.keywords.exclude must be an array');
  }
  return e;
}

// data/areas.json is the lightweight directory index. Detail-rich fields
// (overview, schools, prices, sources …) live in data/areas/<id>.json and
// are validated by validateAreaDetail() below.
export function validateAreas(arr) {
  const e = [];
  check(e, typeOf(arr) === 'array', 'areas must be an array');
  if (typeOf(arr) !== 'array') return e;
  arr.forEach((a, i) => {
    check(e, typeOf(a.id) === 'string', `areas[${i}].id must be a string`);
    check(e, typeOf(a.name) === 'string', `areas[${i}].name must be a string`);
    check(e, typeOf(a.county) === 'string', `areas[${i}].county must be a string`);
    check(e, typeOf(a.town) === 'string', `areas[${i}].town must be a string`);
    check(e, typeOf(a.postcode) === 'string', `areas[${i}].postcode must be a string`);
    const c = a.coords;
    check(e, c === null || (typeOf(c) === 'object' && typeof c.lat === 'number' && typeof c.lng === 'number'),
      `areas[${i}].coords must be null or have numeric lat/lng`);
    check(e, typeOf(a.houseTypeIds) === 'array', `areas[${i}].houseTypeIds must be an array`);
    check(e, typeOf(a.status) === 'string', `areas[${i}].status must be a string`);
    // Phase 4b: priceSummary + councilTaxBand are optional but typed when present.
    if ('priceSummary' in a) {
      const ps = a.priceSummary;
      check(e, ps === null || typeOf(ps) === 'object', `areas[${i}].priceSummary must be null or an object`);
      if (typeOf(ps) === 'object') {
        for (const k of ['avgDetached', 'avgSemi', 'avgTerraced', 'avgFlat']) {
          if (k in ps) check(e, ps[k] === null || typeof ps[k] === 'number', `areas[${i}].priceSummary.${k} must be null or a number`);
        }
        if ('asOf' in ps) check(e, ps.asOf === null || typeof ps.asOf === 'string', `areas[${i}].priceSummary.asOf must be null or a string`);
      }
    }
    if ('councilTaxBand' in a) {
      const ct = a.councilTaxBand;
      check(e, ct === null || (typeof ct === 'string' && /^[A-H]$/i.test(ct)), `areas[${i}].councilTaxBand must be null or A-H`);
    }
  });
  return e;
}

export function validateAreaDetail(a) {
  const e = [];
  check(e, typeOf(a) === 'object', 'area detail must be an object');
  if (typeOf(a) !== 'object') return e;
  check(e, typeOf(a.id) === 'string', 'area.id must be a string');
  check(e, typeOf(a.name) === 'string', 'area.name must be a string');
  check(e, typeOf(a.status) === 'string', 'area.status must be a string');
  // Content fields type-checked only when present (most areas are stubs).
  if ('overview' in a)    check(e, typeOf(a.overview) === 'string', 'area.overview must be a string');
  if ('character' in a)   check(e, typeOf(a.character) === 'string', 'area.character must be a string');
  if ('amenities' in a)   check(e, typeOf(a.amenities) === 'array', 'area.amenities must be an array');
  if ('schools' in a)     check(e, typeOf(a.schools) === 'array', 'area.schools must be an array');
  if ('thingsToDo' in a)  check(e, typeOf(a.thingsToDo) === 'array', 'area.thingsToDo must be an array');
  if ('placesToEat' in a) check(e, typeOf(a.placesToEat) === 'array', 'area.placesToEat must be an array');
  if ('pros' in a)        check(e, typeOf(a.pros) === 'array', 'area.pros must be an array');
  if ('cons' in a)        check(e, typeOf(a.cons) === 'array', 'area.cons must be an array');
  if ('sources' in a)     check(e, typeOf(a.sources) === 'array', 'area.sources must be an array');
  if ('images' in a)      check(e, typeOf(a.images) === 'array', 'area.images must be an array');
  if ('transport' in a)   check(e, typeOf(a.transport) === 'object', 'area.transport must be an object');
  if ('prices' in a)      check(e, typeOf(a.prices) === 'object', 'area.prices must be an object');
  return e;
}

export function validateHouseTypes(arr) {
  const e = [];
  check(e, typeOf(arr) === 'array', 'house-types must be an array');
  if (typeOf(arr) !== 'array') return e;
  arr.forEach((h, i) => {
    check(e, typeOf(h.id) === 'string', `house-types[${i}].id must be a string`);
    check(e, typeOf(h.name) === 'string', `house-types[${i}].name must be a string`);
    check(e, typeOf(h.description) === 'string', `house-types[${i}].description must be a string`);
    check(e, typeOf(h.images) === 'array', `house-types[${i}].images must be an array`);
    // Phase 9C — optional status flag.
    if ('status' in h && h.status != null)
      check(e, typeOf(h.status) === 'string', `house-types[${i}].status must be a string`);
  });
  return e;
}

export function validateFinances(o) {
  const e = [];
  check(e, typeOf(o) === 'object', 'finances must be an object');
  if (typeOf(o) !== 'object') return e;
  check(e, typeOf(o.income) === 'object', 'finances.income must be an object');
  check(e, typeOf(o.goal) === 'object', 'finances.goal must be an object');
  check(e, typeof o.goal?.targetDeposit === 'number', 'finances.goal.targetDeposit must be a number');
  check(e, typeOf(o.savings) === 'object', 'finances.savings must be an object');
  check(e, typeOf(o.oneTimeCosts) === 'array', 'finances.oneTimeCosts must be an array');
  check(e, typeOf(o.ongoingBills) === 'array', 'finances.ongoingBills must be an array');
  check(e, typeOf(o.expenses) === 'array', 'finances.expenses must be an array');
  check(e, typeOf(o.shoppingList) === 'array', 'finances.shoppingList must be an array');
  check(e, typeOf(o.giftCards) === 'array', 'finances.giftCards must be an array');
  return e;
}

export function validateChecklists(o) {
  const e = [];
  check(e, typeOf(o) === 'object', 'checklists must be an object');
  if (typeOf(o) !== 'object') return e;
  check(e, typeOf(o.viewing) === 'array', 'checklists.viewing must be an array');
  check(e, typeOf(o.process) === 'array', 'checklists.process must be an array');
  check(e, typeOf(o.moving) === 'array', 'checklists.moving must be an array');
  return e;
}
