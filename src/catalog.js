/**
 * Каталог: базовые данные берутся из data/catalog.json (сгенерирован из PDF-прайса),
 * поверх накладываются правки администратора из БД (цена, наличие, скрытие).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { db, save } from './store.js';

const FILE = path.join(ROOT, 'data', 'catalog.json');

let base = { brand: {}, categories: [], products: [], delivery: {} };
try {
  base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`[catalog] загружено ${base.products?.length || 0} товаров из data/catalog.json`);
} catch (err) {
  console.error('[catalog] не удалось прочитать data/catalog.json:', err.message);
}

export const brand = base.brand || {};
export const delivery = base.delivery || {};
export const categories = base.categories || [];

function apply(product) {
  const ov = db.overrides[product.id] || {};
  return {
    ...product,
    price: Number.isFinite(ov.price) ? ov.price : product.price,
    basePrice: product.price,
    hidden: Boolean(ov.hidden),
    outOfStock: Boolean(ov.outOfStock),
  };
}

/** Все товары, включая скрытые (для админки). */
export function allProducts() {
  return base.products.map(apply);
}

/** Витрина: только видимые товары. */
export function publicProducts() {
  return allProducts().filter((p) => !p.hidden);
}

export function findProduct(id) {
  const p = base.products.find((x) => x.id === String(id));
  return p ? apply(p) : null;
}

export function searchProducts(query, { includeHidden = false } = {}) {
  const q = query.trim().toLowerCase();
  const list = includeHidden ? allProducts() : publicProducts();
  if (!q) return list;
  return list.filter((p) => {
    const hay = `${p.name} ${p.article} ${p.category} ${p.volumeLabel}`.toLowerCase();
    return hay.includes(q);
  });
}

export function setOverride(productId, patch) {
  const cur = db.overrides[productId] || {};
  const next = { ...cur, ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) delete next[key];
  }
  if (Object.keys(next).length) db.overrides[productId] = next;
  else delete db.overrides[productId];
  save();
  return findProduct(productId);
}

export function categoryTitle(id) {
  return categories.find((c) => c.id === id)?.title || id;
}

export function catalogStats() {
  const products = allProducts();
  return {
    total: products.length,
    hidden: products.filter((p) => p.hidden).length,
    outOfStock: products.filter((p) => p.outOfStock).length,
    edited: Object.keys(db.overrides).length,
  };
}
