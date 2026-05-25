#!/usr/bin/env node
// insert-content.mjs — splice a block of content into a (possibly large) file at a marker.
// Per CLAUDE.md rule #2: write large content to a temp file, then splice it in here instead of
// pasting huge inline edits.
//
// Usage:
//   node tools/insert-content.mjs --target <file> --content <file> --marker "<!-- SLOT:x -->" [--mode before|after|replace] [--dry-run]
//
// Modes:
//   before   (default) insert content immediately BEFORE the marker (marker kept) — good for appending
//                      list items before a closing marker like <!-- END:areas -->
//   after    insert content immediately AFTER the marker (marker kept)
//   replace  replace the marker itself with the content
//
// Notes:
//   - Operates on the FIRST occurrence of the marker; errors if the marker is not found.
//   - Ensures a newline between inserted content and the marker so lines never jam together.
//   - Writes atomically (temp file + rename).

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { argv, exit } from 'node:process';

function parseArgs(args) {
  const out = { mode: 'before', dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--target') out.target = args[++i];
    else if (a === '--content') out.content = args[++i];
    else if (a === '--marker') out.marker = args[++i];
    else if (a === '--mode') out.mode = args[++i];
    else { console.error(`Unknown argument: ${a}`); out.bad = true; }
  }
  return out;
}

const HELP = `insert-content.mjs — splice content into a file at a marker.

  node tools/insert-content.mjs --target <file> --content <file> --marker "<text>" [--mode before|after|replace] [--dry-run]

Modes: before (default) | after | replace`;

const opts = parseArgs(argv.slice(2));

if (opts.help) { console.log(HELP); exit(0); }
if (opts.bad) { console.error('\n' + HELP); exit(2); }

for (const req of ['target', 'content', 'marker']) {
  if (!opts[req]) { console.error(`Missing required --${req}\n\n${HELP}`); exit(2); }
}
if (!['before', 'after', 'replace'].includes(opts.mode)) {
  console.error(`Invalid --mode "${opts.mode}" (use before|after|replace)`); exit(2);
}
if (!existsSync(opts.target)) { console.error(`Target not found: ${opts.target}`); exit(1); }
if (!existsSync(opts.content)) { console.error(`Content not found: ${opts.content}`); exit(1); }

const targetText = readFileSync(opts.target, 'utf8');
let content = readFileSync(opts.content, 'utf8');

const idx = targetText.indexOf(opts.marker);
if (idx === -1) { console.error(`Marker not found in ${opts.target}: ${opts.marker}`); exit(1); }
if (targetText.indexOf(opts.marker, idx + opts.marker.length) !== -1) {
  console.warn(`Warning: marker appears multiple times; using the first occurrence.`);
}

const endsWithNL = (s) => s.endsWith('\n');
let result;
if (opts.mode === 'replace') {
  result = targetText.slice(0, idx) + content + targetText.slice(idx + opts.marker.length);
} else if (opts.mode === 'before') {
  const block = endsWithNL(content) ? content : content + '\n';
  result = targetText.slice(0, idx) + block + targetText.slice(idx);
} else { // after
  const after = idx + opts.marker.length;
  const block = (content.startsWith('\n') ? '' : '\n') + content;
  result = targetText.slice(0, after) + block + targetText.slice(after);
}

if (opts.dryRun) {
  console.log(`[dry-run] would ${opts.mode} ${content.length} chars at marker in ${opts.target}`);
  exit(0);
}

const tmp = `${opts.target}.splice.tmp`;
writeFileSync(tmp, result, 'utf8');
renameSync(tmp, opts.target);
console.log(`Spliced ${content.length} chars (${opts.mode}) into ${opts.target}`);
