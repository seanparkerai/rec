// journey-data.test.js — validates data/journey.json (the buying-journey timeline
// content). Asserts the file parses, has the expected phase/step/task shape, every
// task id is globally unique and well-formed (a stable contract — see plan §7), and
// every referenced outreachTemplateId exists in data/outreach-templates.json.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async (p) => JSON.parse(await readFile(resolve(root, p), 'utf8'));

export async function register({ test, assert, assertEqual }) {
  const journey = await readJson('data/journey.json');
  const templates = await readJson('data/outreach-templates.json');
  const validTemplateIds = new Set(templates.map((t) => t.id));

  test('journey: parses with a version and a non-empty phases array', () => {
    assert(typeof journey.version === 'number', 'journey.version must be a number');
    assert(Array.isArray(journey.phases) && journey.phases.length > 0, 'journey.phases must be a non-empty array');
  });

  test('journey: every phase has id/title/summary and a non-empty steps array', () => {
    for (const p of journey.phases) {
      assert(typeof p.id === 'string' && p.id, `phase missing id`);
      assert(typeof p.title === 'string' && p.title, `phase ${p.id} missing title`);
      assert(typeof p.summary === 'string' && p.summary, `phase ${p.id} missing summary`);
      assert(Array.isArray(p.steps) && p.steps.length > 0, `phase ${p.id} has no steps`);
    }
  });

  test('journey: every step has id/title and a non-empty tasks array', () => {
    for (const p of journey.phases) {
      for (const s of p.steps) {
        assert(typeof s.id === 'string' && s.id, `step in ${p.id} missing id`);
        assert(typeof s.title === 'string' && s.title, `step ${p.id}.${s.id} missing title`);
        assert(Array.isArray(s.tasks) && s.tasks.length > 0, `step ${p.id}.${s.id} has no tasks`);
      }
    }
  });

  test('journey: every task id is globally unique and well-formed (stable contract)', () => {
    const seen = new Set();
    for (const p of journey.phases) {
      for (const s of p.steps) {
        for (const t of s.tasks) {
          assert(typeof t.id === 'string' && t.id, `task in ${p.id}.${s.id} missing id`);
          assert(/^[a-z0-9-]+\.[a-z0-9-]+\.\d+$/.test(t.id), `task id "${t.id}" must be phase.step.n`);
          assert(t.id.startsWith(`${p.id}.${s.id}.`), `task id "${t.id}" must be namespaced under ${p.id}.${s.id}`);
          assert(!seen.has(t.id), `duplicate task id: ${t.id}`);
          seen.add(t.id);
          assert(typeof t.label === 'string' && t.label, `task ${t.id} missing label`);
        }
      }
    }
    assert(seen.size > 0, 'expected at least one task');
  });

  test('journey: every referenced outreachTemplateId exists in outreach-templates.json', () => {
    for (const p of journey.phases) {
      for (const s of p.steps) {
        for (const t of s.tasks) {
          if (!t.outreachTemplateId) continue;
          assert(validTemplateIds.has(t.outreachTemplateId),
            `task ${t.id} references unknown outreach template "${t.outreachTemplateId}"`);
        }
      }
    }
  });
}
