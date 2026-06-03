#!/usr/bin/env node
// enrich-batch-01.mjs — first research batch (4 villages).
// Sources captured per CLAUDE.md §7. Imagery is pending (sandbox network policy
// blocks downloads from commons.wikimedia.org / geograph.org.uk); each record's
// `images: []` will be populated in a follow-up session that runs in an
// environment with outbound access to those hosts.
//
// Re-runs are idempotent: each block is keyed by id.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const path = `${ROOT}data/areas.json`;
const areas = JSON.parse(readFileSync(path, 'utf8'));

const patches = {
  'stockbridge-so20': {
    overview: 'A handsome single-street town midway between Andover and Romsey, set in the Test Valley. Its wide High Street — a legacy of the drovers\' route from Wales — is now lined with tea rooms, gastropubs and independent specialist shops, with a deliberate scarcity of chain stores.',
    character: 'Genteel, free-thinking, well-heeled rural; chalk-stream country with a strong fly-fishing identity (Houghton Fishing Club is the oldest in England, based at the Grosvenor Hotel).',
    amenities: ['Independent High Street shops', 'Tea rooms, pubs and restaurants', 'Orvis flagship fly-fishing store', 'Robjent\'s shooting/fishing outfitter', 'Single supermarket', 'Doctor\'s surgery', 'Stockbridge Primary'],
    thingsToDo: ['Fly-fishing on the upper River Test', 'Walking the Test Way', 'Houghton Down / Danebury Hill Fort'],
    placesToEat: ['The Greyhound on the Test', 'The Three Cups Inn', 'The Grosvenor Hotel'],
    pros: ['Chalk-stream walks on the doorstep', 'Strong independent retail', 'Equidistant Andover ↔ Romsey ↔ Winchester'],
    cons: ['No railway station (nearest: Andover or Winchester)', 'Premium prices — a destination town, not a commuter dorm', 'A30 traffic through the High Street at peak times'],
    whoItSuits: ['Anglers and slow-food households', 'Buyers prioritising market-town amenities over commuter speed'],
    sources: [
      { label: 'Visit Hampshire — Stockbridge', url: 'https://www.visit-hampshire.co.uk/explore/stockbridge-p524261' },
      { label: 'Orvis UK — Stockbridge store', url: 'https://www.orvis.co.uk/pages/stockbridge-store' },
      { label: 'Robjent\'s', url: 'http://www.robjents.co.uk/' },
    ],
    status: 'drafted',
  },
  'broughton-so20': {
    overview: 'A small Test Valley village about four miles west of Stockbridge, organised around its High Street and village hall. The community lost its private store in 2018 but reopened it as a volunteer-run community shop + post office + café, which remains the social anchor.',
    character: 'Working village rather than show village; chalk downland setting, active parish life, primary-school catchment families.',
    amenities: ['Broughton Community Shop (post office + café)', 'Two pubs/restaurants + Thai restaurant', 'Doctor\'s surgery', 'Village hall', 'Parish church', 'Broughton Primary School'],
    thingsToDo: ['Clarendon Way walking', 'Houghton Down nature reserve', 'Mottisfont (NT) within 10 min drive'],
    placesToEat: ['The Greyhound (Broughton)', 'The Tally Ho!'],
    pros: ['Full village amenity set retained via community ownership', 'Cheaper than Stockbridge proper', 'Primary school in the village'],
    cons: ['No station; Salisbury or Andover for trains (~15–20 min drive)', 'Limited evening transport'],
    whoItSuits: ['Young families wanting village school + community shop', 'Downsizers who still want a working village, not a chocolate-box one'],
    sources: [
      { label: 'Broughton Community Shop', url: 'https://broughton.shop/' },
      { label: 'Broughton Village (facilities)', url: 'https://www.broughtonvillage.net/facilities' },
      { label: 'Wikipedia — Broughton, Hampshire', url: 'https://en.wikipedia.org/wiki/Broughton,_Hampshire' },
    ],
    status: 'drafted',
  },
  'wherwell-sp11': {
    overview: 'A picturesque Test Valley village of around 500 residents on the banks of the River Test, three miles south of Andover. Wherwell shows some of the finest straw-thatching in England: black-and-white timber-framed cottages whose thatch sweeps almost to the ground and curls over the windows.',
    character: 'Chocolate-box thatched village; estate-managed countryside; quiet, with strong fishing-tourism economy.',
    amenities: ['The White Lion Inn (oak-beamed coaching inn, 1611)', 'Parish church (St Peter and Holy Cross, rebuilt 1856)', 'Village hall'],
    thingsToDo: ['Wherwell–Chilbolton riverside trail', 'Wherwell–Harewood Forest walk (largest woodland in Hampshire)', 'Trout/grayling fishing on Wherwell Estate beats'],
    placesToEat: ['The White Lion'],
    pros: ['Outstanding visual character', 'Walking + fishing on the doorstep', 'Andover station (~3 mi) for London commute'],
    cons: ['Tiny — no shop, no school in the village (Chilbolton or Andover for both)', 'House prices reflect the postcard appeal', 'Tourist traffic in summer'],
    whoItSuits: ['Buyers willing to pay for a heritage thatched cottage and accept the maintenance', 'Anglers, walkers, weekending households'],
    sources: [
      { label: 'Wikipedia — Wherwell', url: 'https://en.wikipedia.org/wiki/Wherwell' },
      { label: 'Wherwell Estate (fishing)', url: 'https://www.wherwellestate.co.uk/fishing' },
      { label: 'Hampshire CC — Wherwell/Chilbolton trail', url: 'https://www.hants.gov.uk/thingstodo/countryside/walking/wherwellchilbolton' },
    ],
    status: 'drafted',
  },
  'hambledon-po7': {
    overview: 'A village of ~1,000 residents in the Winchester district, set on chalk downland inside the South Downs National Park at the southern end of the Meon Valley. Famed as the "cradle of cricket" — the Hambledon Club at nearby Broadhalfpenny Down was central to the sport\'s 18th-century development.',
    character: 'Linear downland village, 69 listed buildings, Saxon-origin Grade I church; quietly affluent, history-conscious, families and downsizers.',
    amenities: ['Two village shops', 'Pub (the Bat and Ball Inn at Broadhalfpenny Down acts as a cricket museum)', 'Parish church', 'Hambledon Primary (Ofsted Outstanding)', 'Active cricket club at Ridge Meadow'],
    thingsToDo: ['South Downs Way walking', 'Broadhalfpenny Down cricket heritage trail', 'Meon Valley cycling/walking'],
    placesToEat: ['The Bat and Ball Inn', 'The Vine at Hambledon'],
    pros: ['Outstanding primary school', 'Inside the National Park (planning protections)', 'Strong community + sporting fabric', 'Denmead nearby for full supermarket shop'],
    cons: ['No station — Petersfield or Rowlands Castle for trains', 'Tight planning regime limits extensions/alterations', 'Premium for SDNP postcodes'],
    whoItSuits: ['Families chasing the primary school and the National Park setting', 'Cricket-loving second-homers and retirees'],
    sources: [
      { label: 'Wikipedia — Hambledon, Hampshire', url: 'https://en.wikipedia.org/wiki/Hambledon,_Hampshire' },
      { label: 'Hambledon Parish Council — Cricket Club', url: 'https://www.hambledon-pc.gov.uk/Cricket/Cricket_Club.aspx' },
      { label: 'Visit South East England — Hambledon', url: 'https://www.visitsoutheastengland.com/places-to-visit/hambledon-p1272711' },
    ],
    status: 'drafted',
  },
};

let touched = 0;
for (const a of areas) {
  const p = patches[a.id];
  if (!p) continue;
  Object.assign(a, p);
  touched++;
}

writeFileSync(path, `${JSON.stringify(areas, null, 2)}\n`);
console.log(`Patched ${touched} areas.`);
