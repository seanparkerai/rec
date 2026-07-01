// dom-utils.test.js — unit tests for assets/js/dom.js (esc only; byId/setText/setHTML
// require a DOM and are tested implicitly via the characterization tests).

import { esc } from '../../assets/js/dom.js';

export async function register({ test, assert, assertEqual }) {
  await test('dom/esc: plain string passes through', () => {
    assertEqual(esc('hello'), 'hello');
  });

  await test('dom/esc: ampersand → &amp;', () => {
    assertEqual(esc('A & B'), 'A &amp; B');
  });

  await test('dom/esc: less-than → &lt;', () => {
    assertEqual(esc('<b>'), '&lt;b&gt;');
  });

  await test('dom/esc: double-quote → &quot;', () => {
    assertEqual(esc('"hi"'), '&quot;hi&quot;');
  });

  await test('dom/esc: single-quote → &#39;', () => {
    assertEqual(esc("it's"), "it&#39;s");
  });

  await test('dom/esc: null → empty string', () => {
    assertEqual(esc(null), '');
  });

  await test('dom/esc: undefined → empty string', () => {
    assertEqual(esc(undefined), '');
  });

  await test('dom/esc: number coerced to string', () => {
    assertEqual(esc(42), '42');
  });

  await test('dom/esc: XSS payload escaped', () => {
    const payload = '<script>alert("xss")</script>';
    const result = esc(payload);
    assert(!result.includes('<script>'), `should not contain <script>: ${result}`);
    assert(result.includes('&lt;script&gt;'), `should contain escaped form: ${result}`);
  });

  await test('dom/esc: combined characters escaped in one pass', () => {
    assertEqual(esc('<a href="x">test & "more"</a>'),
      '&lt;a href=&quot;x&quot;&gt;test &amp; &quot;more&quot;&lt;/a&gt;');
  });
}
