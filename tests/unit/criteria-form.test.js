// criteria-form.test.js — pure view/binding helpers extracted from page-criteria.js (REFACTOR P7e).
import { gbp, listView, listEdit, fieldView, fieldEdit, setNestedValue } from '../../assets/js/criteria/form.js';

export async function register({ test, assert, assertEqual }) {
  test('criteria/form: gbp formats whole GBP, coerces null to 0', () => {
    assertEqual(gbp(350000), '£350,000');
    assertEqual(gbp(0), '£0');
    assertEqual(gbp(null), '£0');
  });

  test('criteria/form: listView renders a list, "None." when empty, escaping items', () => {
    assertEqual(listView(['a', 'b']), '<ul class="mini-list"><li>a</li><li>b</li></ul>');
    assertEqual(listView([]), '<p class="muted mb-0">None.</p>');
    assertEqual(listView(null), '<p class="muted mb-0">None.</p>');
    assert(listView(['<b>']).includes('&lt;b&gt;'), 'list items must be HTML-escaped');
  });

  test('criteria/form: listEdit emits remove/add controls keyed by fieldId', () => {
    const html = listEdit(['x'], 'foo');
    assert(html.includes('data-remove="foo"') && html.includes('data-index="0"'), 'remove control wired');
    assert(html.includes('add-foo') && html.includes('data-add="foo"'), 'add control wired');
  });

  test('criteria/form: fieldView renders currency via gbp, em dash when empty', () => {
    const cur = fieldView('Budget', 350000, 'currency');
    assert(cur.includes('£350,000') && cur.includes('<dt>Budget</dt>'), `got ${cur}`);
    assert(fieldView('Note', '').includes('—'), 'empty value shows an em dash');
  });

  test('criteria/form: fieldEdit renders input or textarea with f- id + name', () => {
    const inp = fieldEdit('Label', 'myname', 'val');
    assert(inp.includes('id="f-myname"') && inp.includes('name="myname"') && inp.includes('value="val"'), `got ${inp}`);
    assert(fieldEdit('L', 'n', 'v', 'textarea').includes('<textarea'), 'textarea type renders a textarea');
  });

  test('criteria/form: setNestedValue assigns at a dotted path (mutates in place)', () => {
    const o = { a: { b: 1 } };
    setNestedValue(o, 'a.b', 9);
    assertEqual(o.a.b, 9);
    const o2 = { x: 1 };
    setNestedValue(o2, 'x', 5);
    assertEqual(o2.x, 5);
  });
}
