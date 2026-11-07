import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDesignEngine } from '../home/design-engine.js';

const readJSON = async name => JSON.parse(await readFile(new URL(`../home/data/${name}`, import.meta.url), 'utf8'));
const [manifest, catalog, data] = await Promise.all([
  readJSON('scene_manifest.json'), readJSON('product_catalog.json'), readJSON('design-data.json'),
]);
const create = () => createDesignEngine({ manifest, catalog, data });
const line = (quote, room, productId) => quote.lines.find(row => row.room === room && row.product_id === productId);

test('默认预算来自采购包装数量，按分计算，不能由模型实例数量推算', () => {
  const engine = create();
  const quote = engine.quote(engine.defaultState());
  assert.equal(engine.instances, manifest.instances);
  assert.equal(Object.keys(engine.defaultState()).length, 75);
  assert.equal(quote.total_cents, 3964973);
  assert.equal(quote.total, 39649.73);
  assert.equal(quote.delta, 0);
  assert.equal(quote.lines.reduce((sum, row) => sum + row.subtotal_cents, 0), quote.total_cents);
  assert.equal(line(quote, '玄关', 'ikea_trones_80397308').quantity, 3);
  assert.equal(manifest.instances.filter(item => item.product_id === 'ikea_trones_80397308').length, 6);
  assert.equal(line(quote, '主卧', 'ikea_gillersberg_bedside').quantity, 2);
});

test('沙发、茶几及同款多个床头柜逐件替换，重复选择不叠加预算，恢复后完全一致', () => {
  const engine = create();
  const original = engine.defaultState();
  let state = engine.replace(original, 'living_sofa', 'ikea_parup_sofa_79389470');
  state = engine.replace(state, 'living_coffee', 'ikea_lack_coffee_70449906');
  state = engine.replace(state, '主卧_bedside_1', 'ikea_nordkisa_bedside');
  assert.equal(engine.quote(state).delta_cents, -73000);
  assert.equal(line(engine.quote(state), '主卧', 'ikea_gillersberg_bedside').quantity, 1);
  state = engine.replace(state, '主卧_bedside_2', 'ikea_nordkisa_bedside');
  assert.equal(engine.quote(state).delta_cents, -51000);
  assert.equal(line(engine.quote(state), '主卧', 'ikea_gillersberg_bedside'), undefined);
  assert.equal(line(engine.quote(state), '主卧', 'ikea_nordkisa_bedside').quantity, 2);
  const again = engine.replace(state, '主卧_bedside_2', 'ikea_nordkisa_bedside');
  assert.deepEqual(engine.quote(again), engine.quote(state));
  for (const id of ['living_sofa', 'living_coffee', '主卧_bedside_1', '主卧_bedside_2']) {
    state = engine.replace(state, id, original[id]);
  }
  assert.deepEqual(state, original);
  assert.deepEqual(engine.quote(state), engine.quote(original));
  assert.equal(original.living_sofa, 'ikea_kivik_sofa_59440592');
});

test('儿童120床原子更新床垫、床笠、被套、被芯和单枕，重载及恢复不会留下150床品', () => {
  const engine = create();
  const state = engine.replace(engine.defaultState(), 'child_bed', 'ikea_slattum_120');
  const quote = engine.quote(state);
  assert.equal(quote.total_cents, 3864173);
  assert.equal(quote.delta_cents, -100800);
  for (const id of ['ikea_slattum_150', 'ikea_vesteroy_150', 'ikea_solfibbla_dvala_150_bundle', 'ikea_smasporre_200']) {
    assert.equal(line(quote, '儿童房', id), undefined);
  }
  for (const id of ['ikea_slattum_120', 'ikea_vesteroy_120', 'ikea_dvala_120_sage', 'ikea_solfibbla_150_green', 'ikea_smasporre_150']) {
    assert.equal(line(quote, '儿童房', id).quantity, 1);
  }
  assert.equal(line(quote, '儿童房', 'ikea_skogsfraken_pillow').quantity, 1);
  const reloaded = create();
  const persisted = reloaded.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded.quote(persisted), quote);
  const restored = reloaded.replace(persisted, 'child_bed', 'ikea_slattum_150');
  assert.deepEqual(reloaded.quote(restored), engine.quote(engine.defaultState()));
});

test('仅允许显式白名单；恢复存档丢弃未知实例、错误类型和跨家具商品', () => {
  const engine = create();
  assert.equal(engine.instances.filter(item => engine.options(item.id).length > 1).length, 7);
  assert.equal(engine.options('does-not-exist').length, 0);
  assert.equal(engine.getInstance('does-not-exist', {}), null);
});

test('非法替换被拒绝；旧存档安全归一化且不接受额外变换', () => {
  const engine = create();
  const raw = JSON.parse('{"living_sofa":"ikea_slattum_120","child_bed":"ikea_slattum_120","master_bed":"ikea_slattum_150","position":[99,99,99],"__proto__":{"polluted":true}}');
  const state = engine.normalizeState(raw);
  assert.equal(state.living_sofa, 'ikea_kivik_sofa_59440592');
  assert.equal(state.master_bed, 'ikea_malm_180');
  assert.equal(state.child_bed, 'ikea_slattum_120');
  assert.equal(Object.hasOwn(state, 'position'), false);
  assert.equal(Object.hasOwn(state, '__proto__'), false);
  assert.equal({}.polluted, undefined);
  for (const rawValue of [null, undefined, [], 'state', { child_bed: { product_id: 'ikea_slattum_120' } }]) {
    assert.deepEqual(engine.normalizeState(rawValue), engine.defaultState());
  }
  assert.throws(() => engine.replace(state, 'living_sofa', 'ikea_slattum_120'), /候选/);
  assert.throws(() => engine.replace(state, 'unknown', 'ikea_slattum_120'), /未找到/);
  assert.equal(engine.validateReplacement('living_sofa', 'ikea_parup_sofa_79389470', state).ok, true);
});

test('床头柜变高会抬升对应台灯；候选保持锚点和旋转，现有安装scale保留', () => {
  const engine = create();
  const state = engine.replace(engine.defaultState(), '主卧_bedside_1', 'ikea_nordkisa_bedside');
  const bedside = engine.getInstance('主卧_bedside_1', state);
  const lamp = engine.getInstance('主卧_lamp_1', state);
  assert.equal(lamp.position[1], 0.67);
  assert.equal(lamp.position_blender_m[2], 0.67);
  assert.equal(engine.getInstance('主卧_lamp_2', state).position[1], 0.56);
  assert.deepEqual(bedside.position, manifest.instances.find(item => item.id === bedside.id).position);
  assert.deepEqual(bedside.scale, [1, 1, 1]);
  assert.match(bedside.asset, /ikea_nordkisa_bedside\.glb$/);
  assert.deepEqual(engine.getInstance('dining_table', state).scale, [1.7 / 1.2, 1, 1]);
  assert.deepEqual(engine.getInstance('主卧_curtain_0', state).scale,
    manifest.instances.find(item => item.id === '主卧_curtain_0').scale);
  // Returning a transform must not allow the renderer to mutate source data.
  lamp.position[1] = 10;
  assert.equal(engine.getInstance('主卧_lamp_1', state).position[1], 0.67);
  assert.equal(manifest.instances.find(item => item.id === '主卧_lamp_1').position[1], 0.56);
});

test('所有128种已检查组合预算都可计算；锚点或候选规格变化后停止套用空间结论', () => {
  const engine = create();
  const ids = engine.instances.filter(item => engine.options(item.id).length > 1).map(item => item.id);
  for (let mask = 0; mask < 128; mask += 1) {
    let state = engine.defaultState();
    ids.forEach((id, bit) => {
      const pid = engine.options(id)[(mask >> bit) & 1].product_id;
      assert.equal(engine.validateReplacement(id, pid, state).ok, true);
      state = engine.replace(state, id, pid);
    });
    const quote = engine.quote(state);
    assert.equal(quote.total_cents, quote.lines.reduce((sum, row) => sum + row.subtotal_cents, 0));
    assert.ok(quote.lines.every(row => Number.isInteger(row.quantity) && row.quantity > 0));
  }
  const moved = structuredClone(manifest);
  moved.instances.find(item => item.id === 'living_sofa').position[0] += 1;
  const movedEngine = createDesignEngine({ manifest: moved, catalog, data });
  assert.equal(movedEngine.validateReplacement('living_sofa', 'ikea_parup_sofa_79389470', {}).ok, false);
  assert.equal(movedEngine.normalizeState({ living_sofa: 'ikea_parup_sofa_79389470' }).living_sofa, 'ikea_kivik_sofa_59440592');
  const resized = structuredClone(catalog);
  resized.products.find(item => item.product_id === 'ikea_parup_sofa_79389470').model_dimensions_m[0] += 1;
  assert.equal(createDesignEngine({ manifest, catalog: resized, data })
    .validateReplacement('living_sofa', 'ikea_parup_sofa_79389470', {}).ok, false);
});
