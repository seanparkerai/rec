// tests/contract/ask-tool-contract.test.js — the Edge Function prompt/tool-surface
// rail (04-program §4, plan 7.1c/7.1d). Pins the Ask assistant's externally-visible
// contract so it cannot drift silently:
//   • the 13 tool names (renaming/adding/removing a tool must update this rail AND
//     transcript.js TOOL_LABELS in the same commit),
//   • strict tool use on every tool except the one documented exception
//     (get_outreach_brief carries a deliberately free-form `extra` object, which a
//     strict schema cannot express — plan 7.1b),
//   • the model allow-list (owner decision 2026-07-03: Sonnet 5 default, Haiku 4.5
//     step-down; premium tiers unreachable) and the Sonnet-5 thinking-off guard,
//   • the prompt-version ↔ content-hash ratchet: any edit to STATIC_PROMPT or
//     COMPOSE_PROMPT must bump PROMPT_VERSION and re-pin the hash here.
//
// tools.ts / prompt.ts are TypeScript (Deno) modules; they import only pure.js, so
// a Node child process with --experimental-strip-types can load them and dump the
// values as JSON. This keeps the rail on the REAL exported objects rather than a
// regex approximation of the source.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const EXPECTED_TOOLS = [
  'get_finances_detail', 'get_budget_breakdown', 'query_listings', 'get_listing',
  'get_saved_properties', 'get_reactions_summary', 'search_areas', 'get_area',
  'get_household_areas', 'get_trends', 'get_journey_status',
  'get_outreach_templates', 'get_outreach_brief',
];
const STRICT_EXCEPTIONS = new Set(['get_outreach_brief']);

// Bump PROMPT_VERSION in prompt.ts on any prompt edit, then re-pin its hash here.
const PROMPT_HASHES = {
  '2026-07-03': 'f98fdd81ae327bb514de864ddbd7e04ea9b1c3e2617729680d42866b9a2d4207',
};

function loadEdgeExports() {
  const script = `
    import { createHash } from 'node:crypto';
    const t = await import(${JSON.stringify(new URL('../../supabase/functions/ask/tools.ts', import.meta.url).href)});
    const p = await import(${JSON.stringify(new URL('../../supabase/functions/ask/prompt.ts', import.meta.url).href)});
    console.log(JSON.stringify({
      tools: t.TOOLS,
      promptVersion: p.PROMPT_VERSION,
      promptHash: createHash('sha256').update(p.STATIC_PROMPT + '\\n' + p.COMPOSE_PROMPT).digest('hex'),
    }));
  `;
  const out = execFileSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.trim().split('\n').pop());
}

export async function register({ test, assert, assertEqual }) {
  const { tools, promptVersion, promptHash } = loadEdgeExports();
  const indexSrc = readFileSync(new URL('../../supabase/functions/ask/index.ts', import.meta.url), 'utf8');
  const transcriptSrc = readFileSync(new URL('../../assets/js/ask/transcript.js', import.meta.url), 'utf8');
  const composeSrc = readFileSync(new URL('../../assets/js/ask/compose.js', import.meta.url), 'utf8');

  test('rail: the 13 tool names are pinned exactly', () => {
    assertEqual(tools.map((t) => t.name).sort().join(','), [...EXPECTED_TOOLS].sort().join(','));
  });

  test('rail: strict tool use on every tool except the documented exception', () => {
    for (const t of tools) {
      const s = t.input_schema ?? {};
      assertEqual(s.type, 'object', `${t.name}: input_schema.type must be object`);
      if (STRICT_EXCEPTIONS.has(t.name)) {
        assert(t.strict !== true, `${t.name} is the pinned NON-strict exception (free-form extra); making it strict silently drops user facts — update the rail + schema together`);
        continue;
      }
      assert(t.strict === true, `${t.name} must set strict: true (F3)`);
      assert(s.additionalProperties === false, `${t.name} must close its schema (additionalProperties: false)`);
      assert(Array.isArray(s.required), `${t.name} must declare an explicit required array`);
    }
  });

  test('rail: model allow-list — Sonnet 5 default, Haiku step-down, premium tiers unreachable', () => {
    assert(/DEFAULT_MODEL = "claude-sonnet-5"/.test(indexSrc), 'DEFAULT_MODEL is claude-sonnet-5 (owner decision 2026-07-03)');
    assert(/ALLOWED_MODELS = new Set\(\[[^\]]*"claude-haiku-4-5"/.test(indexSrc), 'Haiku 4.5 stays available as the manual step-down');
    assert(!/fable|opus/i.test(indexSrc.match(/ALLOWED_MODELS = new Set\(\[[^\]]*\]\)/)?.[0] ?? 'fable'), 'Fable/Opus tiers must not be reachable from the client');
    assert(/THINKING_OFF_MODELS[\s\S]*"claude-sonnet-5"/.test(indexSrc), 'Sonnet 5 must carry the explicit thinking-off guard (adaptive-on-by-omission would eat the brevity budget)');
    assert(/thinking: \{ type: "disabled" \}/.test(indexSrc), 'the request body sends thinking disabled for THINKING_OFF_MODELS');
  });

  test('rail: transcript TOOL_LABELS covers every tool (vocab drift guard, P10)', () => {
    for (const name of EXPECTED_TOOLS) {
      assert(new RegExp(`^\\s*${name}:`, 'm').test(transcriptSrc), `transcript.js TOOL_LABELS is missing '${name}'`);
    }
  });

  test('rail: compose model is inside the Edge Function allow-list', () => {
    const m = composeSrc.match(/COMPOSE_MODEL = '([^']+)'/);
    assert(m, 'compose.js declares COMPOSE_MODEL');
    const allowed = indexSrc.match(/ALLOWED_MODELS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    assert(allowed.includes(`"${m[1]}"`), `COMPOSE_MODEL '${m[1]}' must be in ALLOWED_MODELS or compose requests silently fall back to the default`);
  });

  test('rail: prompt-version ↔ hash ratchet (edit ⇒ bump ⇒ re-pin)', () => {
    const expected = PROMPT_HASHES[promptVersion];
    assert(expected, `PROMPT_VERSION '${promptVersion}' has no pinned hash — add it to PROMPT_HASHES in this rail`);
    assertEqual(promptHash, expected,
      `prompt content changed without bumping PROMPT_VERSION '${promptVersion}' — bump the version in prompt.ts and pin the new hash here`);
  });

  test('rail: prompt version is logged per request (auditability)', () => {
    assert(/prompt=\$\{PROMPT_VERSION\}/.test(indexSrc), 'index.ts usage log line carries prompt=<version>');
  });

  // Sanity on this rail's own loader: a truncated/failed child dump must not
  // vacuously pass — hash shape + tool count prove real data arrived.
  test('rail: loader returned real exports', () => {
    assertEqual(tools.length, 13);
    assert(/^[0-9a-f]{64}$/.test(promptHash), 'sha256 hash shape');
  });
}
