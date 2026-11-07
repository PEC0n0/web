/** Fixed-position furniture choices and procurement accounting. No CAD is shipped. */
export function createDesignEngine({ manifest, catalog, data }) {
  if (!Array.isArray(manifest?.instances) || !Array.isArray(catalog?.products) || !Array.isArray(data?.bom)) {
    throw new TypeError('装修数据不完整');
  }
  const instances = manifest.instances;
  const byId = new Map(instances.map(instance => [instance.id, instance]));
  const products = new Map(catalog.products.map(product => [product.product_id, product]));
  const assets = new Map((manifest.assets || []).map(asset => [asset.id, asset.path]));
  const rules = data.replacement_rules || {};
  const supportRules = new Map((data.support_rules || []).map(rule => [rule.instance_id, rule]));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const nearArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((value, index) => Number.isFinite(value) && Math.abs(value - b[index]) < 1e-6);
  const allowedIds = id => {
    const instance = byId.get(id);
    if (!instance) return [];
    const rule = own(rules, id) ? rules[id] : null;
    return [instance.product_id, ...(rule?.allowed_product_ids || []).filter(pid =>
      pid !== instance.product_id && instance.alternatives?.includes(pid))];
  };
  const cents = productId => {
    const value = products.get(productId)?.price_cny;
    if (!Number.isFinite(value) || value < 0) throw new Error(`商品价格待确认：${productId}`);
    return Math.round(value * 100);
  };
  const baseTotalCents = data.bom.reduce((sum, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) throw new Error('采购数量必须是非负整数');
    return sum + cents(line.product_id) * line.quantity;
  }, 0);
  if (Number.isInteger(data.base_total_cents) && data.base_total_cents !== baseTotalCents) {
    throw new Error('采购基准与商品价格不一致，请重新核对预算');
  }

  function defaultState() {
    return Object.fromEntries(instances.map(instance => [instance.id, instance.product_id]));
  }

  function normalizeState(raw) {
    const state = defaultState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    for (const instance of instances) {
      if (own(raw, instance.id) && typeof raw[instance.id] === 'string' &&
          allowedIds(instance.id).includes(raw[instance.id]) && products.has(raw[instance.id]) &&
          validateReplacement(instance.id, raw[instance.id]).ok) {
        state[instance.id] = raw[instance.id];
      }
    }
    return state;
  }

  function options(id) {
    return allowedIds(id).map(pid => products.get(pid)).filter(Boolean);
  }

  function getInstance(id, rawState) {
    const original = byId.get(id);
    if (!original) return null;
    const state = normalizeState(rawState);
    const productId = state[id];
    const changed = productId !== original.product_id;
    const product = products.get(productId);
    const result = {
      ...original,
      product_id: productId,
      asset: changed ? assets.get(productId) : original.asset,
      model_dimensions_m: [...product.model_dimensions_m],
      position: [...original.position],
      quaternion: [...original.quaternion],
      scale: changed ? [1, 1, 1] : [...(original.scale || [1, 1, 1])],
      installation_dimensions_m: changed || !original.installation_dimensions_m ? null : [...original.installation_dimensions_m],
      position_blender_m: original.position_blender_m ? [...original.position_blender_m] : undefined,
    };
    // Lamps remain at the same horizontal anchor while following the table top.
    const support = supportRules.get(id);
    if (support) {
      const base = byId.get(support.support_instance_id);
      if (base) {
        const previousHeight = base.installation_dimensions_m?.[2] ?? products.get(base.product_id).model_dimensions_m[2];
        const supportId = state[base.id];
        const nextHeight = supportId === base.product_id ? previousHeight : products.get(supportId).model_dimensions_m[2];
        result.position[1] += nextHeight - previousHeight;
        if (result.position_blender_m) result.position_blender_m[2] += nextHeight - previousHeight;
      }
    }
    return result;
  }

  function validateReplacement(id, productId, rawState) {
    const errors = [];
    const warnings = [];
    const instance = byId.get(id);
    if (!instance) return { ok: false, errors: ['未找到这件家具'], warnings };
    if (!allowedIds(id).includes(productId) || !products.has(productId)) {
      return { ok: false, errors: ['该型号不在这件家具已核对的候选中'], warnings };
    }
    if (productId !== instance.product_id && !assets.has(productId)) errors.push('候选三维资产尚未就绪');
    const rule = own(rules, id) ? rules[id] : null;
    if (rule) {
      if (!nearArray(instance.position, rule.position) || !nearArray(instance.quaternion, rule.quaternion)) {
        errors.push('家具锚点已改变，需要重新检查空间');
      }
      if (!nearArray(products.get(productId).model_dimensions_m, rule.validated_dimensions_m?.[productId])) {
        errors.push('商品尺寸已改变，需要重新检查空间');
      }
      warnings.push(...(rule.warnings || []), ...(data.general_warnings || []));
    }
    // Only immutable, prechecked anchors are exposed. All 128 combinations of
    // these seven binary choices were checked against rooms and solid furniture.
    // Restored state cannot introduce movement, scaling or unlisted products.
    return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)] };
  }

  function replace(rawState, id, productId) {
    const check = validateReplacement(id, productId, rawState);
    if (!check.ok) throw new Error(check.errors.join('；'));
    return { ...normalizeState(rawState), [id]: productId };
  }

  function quote(rawState) {
    const state = normalizeState(rawState);
    const rows = new Map();
    const adjust = (room, productId, quantity, note = '') => {
      const key = JSON.stringify([room, productId]);
      const row = rows.get(key) || { room, product_id: productId, quantity: 0, notes: [] };
      row.quantity += quantity;
      if (row.quantity < 0) throw new Error(`采购联动数量不足：${productId}`);
      if (note && !row.notes.includes(note)) row.notes.push(note);
      rows.set(key, row);
    };
    for (const row of data.bom) adjust(row.room, row.product_id, row.quantity, row.note || '');
    for (const instance of instances) {
      const selected = state[instance.id];
      if (selected === instance.product_id) continue;
      const bundle = data.bundle_rules?.[instance.id]?.[selected];
      if (bundle) {
        for (const line of bundle.remove) adjust(bundle.room, line.product_id, -line.quantity);
        for (const line of bundle.add) adjust(bundle.room, line.product_id, line.quantity, bundle.note);
      } else {
        adjust(instance.room, instance.product_id, -1);
        adjust(instance.room, selected, 1, '按当前家具选择更新');
      }
    }
    let totalCents = 0;
    const lines = [...rows.values()].filter(row => row.quantity > 0).map(row => {
      const unitPriceCents = cents(row.product_id);
      const subtotalCents = unitPriceCents * row.quantity;
      totalCents += subtotalCents;
      return {
        room: row.room, product_id: row.product_id, quantity: row.quantity,
        unit_price: unitPriceCents / 100, subtotal: subtotalCents / 100,
        unit_price_cents: unitPriceCents, subtotal_cents: subtotalCents,
        ...(row.notes.length ? { notes: row.notes.join('；') } : {}),
      };
    });
    return {
      total: totalCents / 100, delta: (totalCents - baseTotalCents) / 100,
      total_cents: totalCents, delta_cents: totalCents - baseTotalCents,
      base_total: baseTotalCents / 100, currency: data.currency || 'CNY', lines,
    };
  }

  return { instances, products, defaultState, normalizeState, getInstance, options, quote, validateReplacement, replace };
}
