import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDesignEngine } from '../home/design-engine.js';
import { createStylesEngine } from '../home/styles-engine.js';

const readJSON = async name => JSON.parse(await readFile(new URL(`../home/data/${name}`, import.meta.url), 'utf8'));
const [manifest, catalog, data, styles] = await Promise.all([
  readJSON('scene_manifest.json'), readJSON('product_catalog.json'),
  readJSON('design-data.json'), readJSON('styles.json'),
]);
const totals = {
  default: 3964973,
  forest_oak: 4008973,
  zen_wood: 4062973,
  cream_minimal: 3946974,
  white_minimal: 3869973,
};
const create = (styleData = styles) => {
  const design = createDesignEngine({ manifest, catalog, data });
  return { design, engine: createStylesEngine({ designEngine: design, styles: styleData }) };
};
const row = (quote, productId, room = '客餐厅') => quote.lines.find(line =>
  line.room === room && line.product_id === productId);
const serialized = value => JSON.parse(JSON.stringify(value));

test('五套方案的采购预算与独立核算一致，默认均保留150儿童床和完整配套', async t => {
  const { engine } = create();
  assert.deepEqual(engine.definitions.map(style => style.id).sort(), Object.keys(totals).sort());
  for (const [id, expected] of Object.entries(totals)) {
    await t.test(id, () => {
      const choices = engine.defaults(id);
      const quote = engine.quote(id, choices);
      assert.equal(quote.total_cents, expected);
      assert.equal(engine.getStyle(id).ikea_total_cents, expected);
      assert.equal(quote.base_total, expected / 100);
      assert.equal(quote.delta_cents, 0);
      assert.equal(quote.lines.reduce((sum, item) => sum + item.subtotal_cents, 0), expected);
      assert.ok(quote.lines.every(item => Number.isInteger(item.quantity) && item.quantity > 0));
      assert.equal(choices.child_bed, 'ikea_slattum_150');
      assert.equal(row(quote, 'ikea_vesteroy_150', '儿童房').quantity, 1);
      assert.equal(row(quote, 'ikea_solfibbla_dvala_150_bundle', '儿童房').quantity, 1);
      assert.equal(row(quote, 'ikea_smasporre_200', '儿童房').quantity, 1);
      assert.equal(row(quote, 'ikea_vesteroy_120', '儿童房'), undefined);
      // Covers change colour, but their existing inserts remain three units.
      assert.equal(row(quote, 'ikea_inner_insert_40262194').quantity, 3);
    });
  }
});

test('各方案独立保存家具选择；切换与重置当前方案不覆盖其他方案或原会话', () => {
  const { design, engine } = create();
  const original = engine.newSession();
  const untouched = serialized(original);
  let session = engine.activate(original, 'forest_oak');
  session = engine.setChoices(session, design.replace(session.styles.forest_oak.choices,
    'living_sofa', 'ikea_parup_sofa_79389470'));
  assert.equal(engine.quote('forest_oak', session.styles.forest_oak.choices).delta_cents, -50000);
  session = engine.activate(session, 'white_minimal');
  session = engine.setChoices(session, design.replace(session.styles.white_minimal.choices,
    'living_coffee', 'ikea_lisabo_coffee_90353064'));
  assert.equal(engine.quote('white_minimal', session.styles.white_minimal.choices).delta_cents, 55000);
  const whiteCustom = serialized(session.styles.white_minimal.choices);

  session = engine.activate(session, 'forest_oak');
  assert.equal(session.styles.forest_oak.choices.living_sofa, 'ikea_parup_sofa_79389470');
  session = engine.setChoices(session, engine.defaults('forest_oak'));
  assert.deepEqual(session.styles.forest_oak.choices, engine.defaults('forest_oak'));
  assert.deepEqual(session.styles.white_minimal.choices, whiteCustom);
  assert.deepEqual(session.styles.default.choices, engine.defaults('default'));
  assert.deepEqual(original, untouched);
  assert.equal(session.activeStyleId, 'forest_oak');
  assert.equal(engine.quote('forest_oak', session.styles.forest_oak.choices).delta_cents, 0);
});

test('方案差额以所选风格为基准，原方案预算不会混入其他风格的默认差额', () => {
  const { design, engine } = create();
  const forest = engine.defaults('forest_oak');
  const custom = design.replace(forest, 'living_coffee', 'ikea_lack_coffee_70449906');
  assert.equal(engine.quote('forest_oak', custom).total_cents, 3963973);
  assert.equal(engine.quote('forest_oak', custom).delta_cents, -45000);
  assert.equal(engine.quote('default', custom).delta_cents, -1000);
  assert.equal(engine.quote('forest_oak', forest).total_cents, totals.forest_oak);
});

test('VINDEBÄK联动移除STOPP，重复切换和重置能恢复原地毯与一块衬垫', () => {
  const { design, engine } = create();
  const original = engine.defaults('cream_minimal');
  const originalQuote = engine.quote('cream_minimal', original);
  assert.equal(row(originalQuote, 'ikea_vindebak_rug_80507887').quantity, 1);
  assert.equal(row(originalQuote, 'ikea_tiphede_rug_60470045'), undefined);
  assert.equal(row(originalQuote, 'ikea_stopp_filt_30183084'), undefined);

  let choices = original;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    choices = design.replace(choices, 'living_rug', 'ikea_tiphede_rug_60470045');
    const restored = engine.quote('cream_minimal', choices);
    assert.equal(restored.total_cents, 3919973);
    assert.equal(restored.delta_cents, -27001);
    assert.equal(row(restored, 'ikea_tiphede_rug_60470045').quantity, 1);
    assert.equal(row(restored, 'ikea_stopp_filt_30183084').quantity, 1);
    assert.equal(row(restored, 'ikea_vindebak_rug_80507887'), undefined);
    choices = design.replace(choices, 'living_rug', 'ikea_vindebak_rug_80507887');
    assert.deepEqual(engine.quote('cream_minimal', choices), originalQuote);
  }
  const defaultQuote = engine.quote('default', engine.defaults('default'));
  assert.equal(defaultQuote.total_cents, totals.default);
  assert.equal(row(defaultQuote, 'ikea_stopp_filt_30183084').quantity, 1);
});

test('v1存档只迁移到原方案，四个新方案保持各自默认搭配', () => {
  const { design, engine } = create();
  let oldChoices = design.replace(design.defaultState(), 'living_sofa', 'ikea_parup_sofa_79389470');
  oldChoices = design.replace(oldChoices, 'child_bed', 'ikea_slattum_120');
  const imported = engine.importSession({ schema: 'peco-home/v1', choices: serialized(oldChoices) });
  assert.equal(imported.schema, 'peco-home/v2');
  assert.equal(imported.activeStyleId, 'default');
  assert.deepEqual(imported.styles.default.choices, oldChoices);
  assert.equal(engine.quote('default', imported.styles.default.choices).total_cents, 3814173);
  for (const id of Object.keys(totals).filter(id => id !== 'default')) {
    assert.deepEqual(imported.styles[id].choices, engine.defaults(id));
    assert.equal(imported.styles[id].choices.child_bed, 'ikea_slattum_150');
  }
});

test('v2完整存档往返保留多个独立修改和当前方案，导入不共享输入对象', () => {
  const { design, engine } = create();
  let session = engine.activate(engine.newSession(), 'zen_wood');
  session = engine.setChoices(session, design.replace(session.styles.zen_wood.choices,
    'living_sofa', 'ikea_parup_sofa_79389470'));
  session = engine.activate(session, 'cream_minimal');
  session = engine.setChoices(session, design.replace(session.styles.cream_minimal.choices,
    'living_rug', 'ikea_tiphede_rug_60470045'));
  const input = serialized(session);
  const imported = engine.importSession(input);
  assert.deepEqual(imported, session);
  assert.equal(imported.activeStyleId, 'cream_minimal');
  assert.equal(engine.quote('zen_wood', imported.styles.zen_wood.choices).total_cents, 4012973);
  assert.equal(engine.quote('cream_minimal', imported.styles.cream_minimal.choices).total_cents, 3919973);
  input.styles.zen_wood.choices.living_sofa = 'ikea_kivik_sofa_59440592';
  assert.equal(imported.styles.zen_wood.choices.living_sofa, 'ikea_parup_sofa_79389470');
});

test('较早的v2文件允许缺少非当前方案，并补齐其默认配置', () => {
  const { engine } = create();
  const imported = engine.importSession({
    schema: 'peco-home/v2', activeStyleId: 'white_minimal',
    styles: { white_minimal: { choices: engine.defaults('white_minimal') } },
  });
  assert.equal(imported.activeStyleId, 'white_minimal');
  assert.deepEqual(Object.keys(imported.styles).sort(), Object.keys(totals).sort());
  for (const id of Object.keys(totals)) assert.deepEqual(imported.styles[id].choices, engine.defaults(id));
});

test('恢复优先有效v2，损坏v2退回有效v1，两者无效时使用新会话', () => {
  const { design, engine } = create();
  const v2 = engine.activate(engine.newSession(), 'forest_oak');
  const v1 = {
    schema: 'peco-home/v1',
    choices: design.replace(design.defaultState(), 'living_coffee', 'ikea_lack_coffee_70449906'),
  };
  assert.deepEqual(engine.restore(serialized(v2), v1), { source: 'v2', session: v2 });
  const corrupt = serialized(v2);
  delete corrupt.styles.forest_oak.choices.living_sofa;
  const fallback = engine.restore(corrupt, v1);
  assert.equal(fallback.source, 'v1');
  assert.equal(fallback.session.styles.default.choices.living_coffee, 'ikea_lack_coffee_70449906');
  assert.deepEqual(engine.restore(corrupt, { schema: 'peco-home/v1', choices: {} }),
    { source: 'new', session: engine.newSession() });
  assert.deepEqual(engine.restore(null, null), { source: 'new', session: engine.newSession() });
});

test('无效导入整份拒绝，不静默接受丢失家具、跨类别型号或未知方案', async t => {
  const { engine } = create();
  const baseline = engine.newSession();
  const corruptions = [
    ['unsupported schema', raw => { raw.schema = 'peco-home/v99'; }],
    ['unknown active style', raw => { raw.activeStyleId = 'invented'; }],
    ['missing active record', raw => { delete raw.styles.default; }],
    ['unknown style record', raw => { raw.styles.invented = raw.styles.default; }],
    ['array styles', raw => { raw.styles = []; }],
    ['null style record', raw => { raw.styles.default = null; }],
    ['array choices', raw => { raw.styles.default.choices = []; }],
    ['missing furniture', raw => { delete raw.styles.default.choices.living_sofa; }],
    ['unknown furniture with unchanged count', raw => {
      delete raw.styles.default.choices.living_sofa;
      raw.styles.default.choices.not_a_real_instance = 'ikea_kivik_sofa_59440592';
    }],
    ['cross-category product', raw => { raw.styles.default.choices.living_sofa = 'ikea_slattum_150'; }],
    ['object product value', raw => { raw.styles.default.choices.living_sofa = { product_id: 'ikea_kivik_sofa_59440592' }; }],
    ['unknown product in inactive style', raw => { raw.styles.zen_wood.choices.living_coffee = 'ikea_invented'; }],
  ];
  for (const [name, corrupt] of corruptions) {
    await t.test(name, () => {
      const raw = serialized(baseline);
      corrupt(raw);
      assert.throws(() => engine.importSession(raw), Error);
      assert.deepEqual(engine.newSession(), baseline);
    });
  }
  for (const raw of [null, undefined, [], 'not-json', 42]) assert.throws(() => engine.importSession(raw), Error);
  assert.throws(() => engine.activate(baseline, 'invented'), /没有找到/);
  assert.deepEqual(baseline, engine.newSession());
});

test('导入的总价、明细和价格表均不可信，预算只来自已核对商品目录与当前选择', () => {
  const { engine } = create();
  const raw = engine.activate(engine.newSession(), 'cream_minimal');
  raw.total = 0.01;
  raw.total_cents = 1;
  raw.base_total_cents = 1;
  raw.bom = [{ product_id: 'ikea_vindebak_rug_80507887', quantity: 0 }];
  raw.catalog = { products: [{ product_id: 'ikea_vindebak_rug_80507887', price_cny: 0.01 }] };
  raw.styles.cream_minimal.total_cents = -999999;
  raw.styles.cream_minimal.quote = { total_cents: 1, lines: [] };
  const imported = engine.importSession(serialized(raw));
  const quote = engine.quote(imported.activeStyleId, imported.styles.cream_minimal.choices);
  assert.equal(quote.total_cents, totals.cream_minimal);
  assert.equal(row(quote, 'ikea_vindebak_rug_80507887').unit_price_cents, 49900);
  assert.equal(row(quote, 'ikea_vindebak_rug_80507887').quantity, 1);
  assert.equal(row(quote, 'ikea_stopp_filt_30183084'), undefined);
  assert.deepEqual(Object.keys(imported).sort(), ['activeStyleId', 'schema', 'styles']);
  assert.deepEqual(Object.keys(imported.styles.cream_minimal), ['choices']);

  // Even a stale display total in a preset cannot replace the calculated BOM.
  const stale = structuredClone(styles);
  stale.styles.find(style => style.id === 'cream_minimal').ikea_total_cents = 1;
  const rebuilt = create(stale).engine;
  assert.equal(rebuilt.quote('cream_minimal', rebuilt.defaults('cream_minimal')).total_cents, totals.cream_minimal);
});

test('作者配置中出现未核对家具时初始化失败，避免显示看似可用的错误预设', () => {
  const unknownProduct = structuredClone(styles);
  unknownProduct.styles.find(style => style.id === 'forest_oak').choices.living_sofa = 'ikea_slattum_150';
  assert.throws(() => create(unknownProduct), /方案家具需要重新核对/);
  const duplicate = structuredClone(styles);
  duplicate.styles.push(structuredClone(duplicate.styles[0]));
  assert.throws(() => create(duplicate), /装修方案标识无效/);
});
