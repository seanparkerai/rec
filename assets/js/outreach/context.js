import { assembleContext, filterContextByDataNeeded } from '../outreach-renderer.js';
import { byId as $ } from '../dom.js';
import { state } from './state.js';

export const EXTRA_FIELDS = {
  viewingDateOption1: { label: 'Viewing option 1', placeholder: 'e.g. Saturday 7 June, morning', type: 'text' },
  viewingDateOption2: { label: 'Viewing option 2', placeholder: 'e.g. Tuesday 10 June after 5pm', type: 'text' },
  offerDeadline:      { label: 'Offer deadline', placeholder: 'e.g. Friday 6 June at 5pm', type: 'text' },
  offerDate:          { label: 'Date offer was made', placeholder: 'e.g. 2 June 2026', type: 'text' },
  offerAcceptedDate:  { label: 'Date offer accepted', placeholder: 'e.g. 3 June 2026', type: 'text' },
  withdrawalReason:   { label: 'Reason for withdrawal', placeholder: 'e.g. Survey revealed subsidence', type: 'text' },
  counterOfferResponse: { label: 'Counter-offer response', placeholder: 'e.g. I can increase to £378,000 — my final position.', type: 'textarea' },
  surveyConcerns:     { label: 'Survey concerns to flag', placeholder: 'e.g. damp on north wall, cracked lintel above bay window', type: 'textarea' },
  surveyQuestions:    { label: 'Post-report questions', placeholder: 'What does amber on the bay window mean?', type: 'textarea' },
  surveyFindings:     { label: 'Survey findings (from report)', placeholder: 'e.g. Bay window lintel cracked (amber)', type: 'textarea' },
  surveyRemediationCost: { label: 'Estimated remediation cost (£)', placeholder: '8000', type: 'number' },
  surveyFee:          { label: 'Survey fee agreed (£)', placeholder: '450', type: 'number' },
  surveyDateOption1:  { label: 'Survey date option 1', placeholder: 'Monday 9 June', type: 'text' },
  surveyDateOption2:  { label: 'Survey date option 2', placeholder: 'Wednesday 11 June', type: 'text' },
  surveyTurnaround:   { label: 'Report turnaround (days)', placeholder: '5', type: 'number' },
  targetExchangeDate: { label: 'Target exchange date', placeholder: '2026-07-15', type: 'date' },
  targetCompletionDate: { label: 'Target completion date', placeholder: '2026-07-29', type: 'date' },
  removalsVolume:     { label: 'Volume description', placeholder: 'e.g. 3-bed house worth of furniture', type: 'text' },
  removalsRooms:      { label: 'Number of rooms', placeholder: '3', type: 'number' },
  removalsSpecialItems: { label: 'Large / specialist items', placeholder: 'e.g. Piano, wardrobe requiring disassembly', type: 'text' },
  removalsPackingReq: { label: 'Packing requirement', placeholder: 'e.g. Self-pack, transport only', type: 'text' },
  meterReadingGas:    { label: 'Gas meter reading', placeholder: '01234', type: 'text' },
  meterReadingElec:   { label: 'Electricity meter reading', placeholder: '56789', type: 'text' },
  meterReadingWater:  { label: 'Water meter reading', placeholder: '11111', type: 'text' },
  'vendor.streetName': { label: 'Street name', placeholder: 'Cottage Lane', type: 'text' },
  'vendor.areaName':   { label: 'Area name', placeholder: 'Sparsholt', type: 'text' },
};

export const CTX_FIELD_KEYS = [
  'listing.address', 'listing.askingPrice', 'listing.offerAmount', 'listing.agreedPrice',
  'listing.portal', 'listing.ref', 'listing.tenure',
];

export function buildBaseContext() {
  const ctx = assembleContext({ profile: state.profile, criteria: state.criteria, finances: state.finances });
  if (state.finances) {
    ctx.finances = ctx.finances || {};
    if (!ctx.finances.aipAmount && state.finances.mortgage?.targetMax) {
      ctx.finances.aipAmount = state.finances.mortgage.targetMax;
    }
    if (!ctx.finances.depositAmount && state.finances.goal?.targetDeposit) {
      ctx.finances.depositAmount = state.finances.goal.targetDeposit;
    }
    if (!ctx.finances.depositSource) {
      ctx.finances.depositSource = 'Cash ISA';
    }
  }
  return ctx;
}

export function buildCurrentContext() {
  const base = buildBaseContext();

  const contactSel = $('ctx-contact');
  const contactNameInput = $('ctx-contact-name');
  const selectedContactVal = contactSel?.value;
  let contactData = {};
  if (selectedContactVal) {
    try { contactData = JSON.parse(selectedContactVal); } catch { /* ignore */ }
  }
  if (contactNameInput?.value) {
    const role = state.activeTemplate?.recipientRole;
    const nameKey = {
      'estate-agent': 'agentName',
      'mortgage-broker': 'brokerName',
      'solicitor': 'solicitorName',
      'surveyor': 'surveyorName',
    }[role] || 'agentName';
    contactData[nameKey] = contactData[nameKey] || contactNameInput.value;
  }
  base.contact = { ...base.contact, ...contactData };

  const addr = $('ctx-address')?.value?.trim();
  const price = $('ctx-price')?.value;
  const offer = $('ctx-offer')?.value;
  const portal = $('ctx-portal')?.value?.trim();
  const ref = $('ctx-ref')?.value?.trim();
  const tenure = $('ctx-tenure')?.value;

  base.listing = base.listing || {};
  if (addr)   base.listing.address = addr;
  if (price)  { base.listing.askingPrice = price; base.listing.agreedPrice = price; }
  if (offer)  {
    base.listing.offerAmount = offer;
    if (price) base.listing.offerAsPctOfAsking = Math.round((Number(offer) / Number(price)) * 100);
  }
  if (portal) base.listing.portal = portal;
  if (ref)    base.listing.ref = ref;
  if (tenure) base.listing.tenure = tenure;

  const extras = {};
  $('extra-fields')?.querySelectorAll('[data-extra-key]').forEach((inp) => {
    const key = inp.dataset.extraKey;
    const val = inp.value?.trim();
    if (val) {
      if (key.includes('.')) {
        const [top, sub] = key.split('.');
        base[top] = base[top] || {};
        base[top][sub] = val;
      } else {
        extras[key] = val;
      }
    }
  });
  Object.assign(base, extras);

  return base;
}
