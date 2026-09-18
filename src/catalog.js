/**
 * Каталог: базовые данные берутся из data/catalog.json (сгенерирован из PDF-прайса),
 * поверх накладываются правки администратора из БД:
 *  - overrides: изменение любых полей базовых товаров (цена, наличие, скрытие…),
 *  - customProducts: товары, добавленные админом через бота или веб-админку,
 *  - категории и информация о магазине (бренд, доставка, реквизиты, тексты).
 * Ручные правки живут в data/db.json и не затираются пересборкой из нового прайса.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { db, save } from './store.js';

const FILE = path.join(ROOT, 'data', 'catalog.json');
const BUNDLE_FILE = path.join(ROOT, 'src', 'catalog.bundle.json');
const FALLBACK_FILES = [
  FILE,
  BUNDLE_FILE,
  path.join(ROOT, 'data', 'catalog.json.bundled'),
  path.join(ROOT, 'webapp', 'assets', 'catalog.json'),
];
export const PRODUCTS_DIR = path.join(ROOT, 'webapp', 'assets', 'products');

function ensureDataDir() {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function tryLoad(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.products)) throw new Error('неверный формат каталога');
    return parsed;
  } catch {
    return null;
  }
}

let base = { brand: {}, categories: [], products: [], delivery: {} };
let loadedFrom = null;
for (const candidate of FALLBACK_FILES) {
  const data = tryLoad(candidate);
  if (data) {
    base = data;
    loadedFrom = candidate;
    break;
  }
}

if (base.products?.length) {
  const rel = path.relative(ROOT, loadedFrom || FILE);
  console.log(`[catalog] загружено ${base.products.length} товаров из ${rel}`);
  // самовосстановление: если основной файл отсутствует или пуст, копируем туда бандл
  if (loadedFrom && loadedFrom !== FILE) {
    try {
      ensureDataDir();
      if (!fs.existsSync(FILE) || tryLoad(FILE) === null) {
        fs.writeFileSync(FILE, JSON.stringify(base, null, 1));
        console.log(`[catalog] восстановлен ${path.relative(ROOT, FILE)} из ${rel}`);
      }
    } catch (err) {
      console.warn(`[catalog] не удалось восстановить ${FILE}:`, err.message);
    }
  }
} else {
  console.error('[catalog] не удалось прочитать data/catalog.json: ENOENT — пробовал:', FALLBACK_FILES.map((p) => path.relative(ROOT, p)).join(', '));
  // последняя попытка — встроенный бандл уже проверен, но если его нет — логируем инструкцию
  console.error('[catalog] в data/catalog.json нет товаров — витрина будет пустой. Пересоберите прайс: npm run catalog');
}

/** Принудительно пересоздать data/catalog.json из бандла (для healEmptyCatalog и админки). */
export function ensureCatalogFile() {
  if (fs.existsSync(FILE) && tryLoad(FILE)?.products?.length) return true;
  const bundle = tryLoad(BUNDLE_FILE);
  if (!bundle?.products?.length) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(FILE, JSON.stringify(bundle, null, 1));
    base = bundle;
    console.log(`[catalog] восстановлен из бандла: ${bundle.products.length} позиций`);
    return true;
  } catch (err) {
    console.error('[catalog] ошибка восстановления из бандла:', err.message);
    return false;
  }
}

/** Базовые (из прайса) значения — для витрины используйте get* функции ниже. */
export const brand = base.brand || {};
export const delivery = base.delivery || {};
export const categories = base.categories || [];

// ─── товары ───────────────────────────────────────────────────

function apply(product) {
  const ov = db.overrides[product.id] || {};
  const merged = { ...product, ...ov };
  return {
    ...merged,
    price: Number.isFinite(merged.price) ? merged.price : product.price,
    basePrice: product.price,
    hidden: Boolean(merged.hidden),
    outOfStock: Boolean(merged.outOfStock),
    isNew: Boolean(merged.isNew),
    isHit: Boolean(merged.isHit),
    custom: Boolean(db.customProducts[product.id]),
  };
}

function baseList() {
  const deleted = new Set(db.deletedProducts || []);
  return (base.products || []).filter((p) => !deleted.has(String(p.id)));
}

function customList() {
  return Object.values(db.customProducts || {});
}

/** Все товары, включая скрытые (для админки). */
export function allProducts() {
  return [...baseList().map(apply), ...customList().map(apply)];
}

/** Витрина: только видимые товары. */
export function publicProducts() {
  return allProducts().filter((p) => !p.hidden);
}

export function findProduct(id) {
  const key = String(id);
  const p = baseList().find((x) => String(x.id) === key) || db.customProducts[key];
  return p ? apply(p) : null;
}

/** Сырой товар без наложения правок (для форм редактирования). */
export function findProductRaw(id) {
  const key = String(id);
  return baseList().find((x) => String(x.id) === key) || db.customProducts[key] || null;
}

export function isCustomProduct(id) {
  return Boolean(db.customProducts[String(id)]);
}

export function isDeletedProduct(id) {
  return (db.deletedProducts || []).includes(String(id));
}

export function searchProducts(query, { includeHidden = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const list = includeHidden ? allProducts() : publicProducts();
  if (!q) return list;
  return list.filter((p) => {
    const hay = `${p.name} ${p.article} ${p.category} ${p.volumeLabel || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

export function setOverride(productId, patch) {
  const cur = db.overrides[String(productId)] || {};
  const next = { ...cur, ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) delete next[key];
  }
  if (Object.keys(next).length) db.overrides[String(productId)] = next;
  else delete db.overrides[String(productId)];
  save();
  return findProduct(productId);
}

// ─── CRUD товаров ─────────────────────────────────────────────

const PRODUCT_FIELDS = [
  'name', 'article', 'category', 'price', 'volumeMl', 'pieces',
  'volumeLabel', 'image', 'isNew', 'isHit', 'description', 'hidden', 'outOfStock',
];

function nextProductId() {
  const used = new Set(allProducts().map((p) => String(p.id)));
  let max = 0;
  for (const id of used) {
    if (/^\d{1,4}$/.test(id)) max = Math.max(max, Number(id));
  }
  for (let n = max + 1; n < 1000; n += 1) {
    const candidate = String(n).padStart(3, '0');
    if (!used.has(candidate)) return candidate;
  }
  let candidate = `n${Date.now().toString(36)}`;
  while (used.has(candidate)) candidate = `n${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;
  return candidate;
}

function articleTaken(article, exceptId = null) {
  const a = String(article || '').trim().toLowerCase();
  if (!a) return false;
  return allProducts().some(
    (p) => String(p.article || '').trim().toLowerCase() === a && String(p.id) !== String(exceptId),
  );
}

function normalizeProductInput(data, { partial = false } = {}) {
  const out = {};
  if (data.name !== undefined) {
    const name = String(data.name || '').trim().slice(0, 160);
    if (!name && !partial) throw new Error('Укажите название товара');
    if (name) out.name = name;
    else if (!partial) throw new Error('Укажите название товара');
  } else if (!partial) throw new Error('Укажите название товара');
  if (data.article !== undefined) {
    const article = String(data.article || '').trim().slice(0, 40);
    if (article) out.article = article;
  }
  if (data.category !== undefined) {
    const category = String(data.category || '').trim();
    if (category) {
      if (!findCategory(category)) throw new Error('Категория не найдена');
      out.category = category;
    } else if (!partial) throw new Error('Укажите категорию');
  } else if (!partial) throw new Error('Укажите категорию');
  if (data.price !== undefined) {
    const price = Math.round(Number(String(data.price).replace(/[^\d.,]/g, '').replace(',', '.')));
    if (!Number.isFinite(price) || price <= 0) throw new Error('Цена должна быть положительным числом');
    out.price = price;
  } else if (!partial) throw new Error('Укажите цену');
  if (data.volumeMl !== undefined) {
    const v = Number.parseInt(data.volumeMl, 10);
    out.volumeMl = Number.isFinite(v) && v > 0 ? v : null;
  }
  if (data.pieces !== undefined) {
    const v = Number.parseInt(data.pieces, 10);
    out.pieces = Number.isFinite(v) && v > 0 ? Math.min(v, 999) : 1;
  }
  if (data.volumeLabel !== undefined) out.volumeLabel = String(data.volumeLabel || '').trim().slice(0, 60);
  if (data.image !== undefined) out.image = String(data.image || '').trim().slice(0, 300);
  if (data.description !== undefined) out.description = String(data.description || '').trim().slice(0, 2000);
  for (const flag of ['isNew', 'isHit', 'hidden', 'outOfStock']) {
    if (data[flag] !== undefined) out[flag] = Boolean(data[flag]);
  }
  return out;
}

/** Создать новый товар (хранится в БД, переживает пересборку прайса). */
export function createProduct(data) {
  const patch = normalizeProductInput(data);
  if (!patch.article) patch.article = nextProductId();
  if (articleTaken(patch.article)) throw new Error(`Артикул «${patch.article}» уже занят`);
  const cats = getCategories();
  if (!patch.category) patch.category = cats[0]?.id;
  if (!patch.category) throw new Error('Нет ни одной категории — создайте её сначала');

  let id = String(data.id || '').trim() || patch.article;
  const used = new Set(allProducts().map((p) => String(p.id)));
  if (used.has(id) || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = nextProductId();

  const product = {
    id,
    article: patch.article,
    name: patch.name,
    category: patch.category,
    price: patch.price,
    volumeMl: patch.volumeMl ?? null,
    pieces: patch.pieces ?? 1,
    volumeLabel: patch.volumeLabel || (patch.volumeMl ? `${patch.volumeMl} мл` : ''),
    image: patch.image || '',
    isNew: patch.isNew ?? true,
    isHit: patch.isHit ?? false,
    description: patch.description || '',
    hidden: patch.hidden ?? false,
    outOfStock: patch.outOfStock ?? false,
    createdAt: Date.now(),
  };
  db.customProducts[id] = product;
  save();
  return apply(product);
}

/** Обновить товар: для базовых пишется в overrides, для своих — напрямую. */
export function updateProduct(id, data) {
  const key = String(id);
  const raw = findProductRaw(key);
  if (!raw) throw new Error('Товар не найден');
  const patch = normalizeProductInput(data, { partial: true });
  if (patch.article && articleTaken(patch.article, key)) {
    throw new Error(`Артикул «${patch.article}» уже занят`);
  }
  if (patch.volumeMl && !patch.volumeLabel && data.volumeLabel === undefined) {
    patch.volumeLabel = `${patch.volumeMl} мл`;
  }
  if (db.customProducts[key]) {
    Object.assign(db.customProducts[key], patch, { updatedAt: Date.now() });
    save();
    return findProduct(key);
  }
  return setOverride(key, patch);
}

/** Удалить товар: свои удаляются полностью, базовые прячутся в deletedProducts. */
export function deleteProduct(id) {
  const key = String(id);
  if (db.customProducts[key]) {
    delete db.customProducts[key];
    delete db.overrides[key];
    save();
    return { deleted: true, custom: true };
  }
  const exists = (base.products || []).some((p) => String(p.id) === key);
  if (!exists) throw new Error('Товар не найден');
  if (!db.deletedProducts.includes(key)) db.deletedProducts.push(key);
  delete db.overrides[key];
  save();
  return { deleted: true, custom: false };
}

export function restoreProduct(id) {
  const key = String(id);
  db.deletedProducts = (db.deletedProducts || []).filter((x) => x !== key);
  save();
  return findProduct(key);
}

// ─── восстановление каталога из прайса ────────────────────────

/** Базовые позиции из прайса, помеченные админом как удалённые. */
export function deletedBaseProducts() {
  const set = new Set((db.deletedProducts || []).map(String));
  return (base.products || []).filter((p) => set.has(String(p.id))).map(apply);
}

function deletedBaseIds() {
  const known = new Set((base.products || []).map((p) => String(p.id)));
  return (db.deletedProducts || []).map(String).filter((id) => known.has(id));
}

function hiddenBaseIds() {
  return (base.products || [])
    .map((p) => String(p.id))
    .filter((id) => db.overrides[id]?.hidden === true);
}

/**
 * Состояние каталога: сколько позиций в прайсе, сколько видно на витрине,
 * сколько скрыто и удалено. `broken` — витрина пуста, хотя в прайсе позиции есть.
 */
export function catalogHealth() {
  const baseTotal = (base.products || []).length;
  const visible = publicProducts().length;
  const deleted = deletedBaseIds().length;
  const hidden = hiddenBaseIds().length;
  return {
    baseTotal,
    visible,
    deleted,
    hidden,
    custom: Object.keys(db.customProducts || {}).length,
    broken: baseTotal > 0 && visible === 0,
  };
}

/**
 * Возвращает в каталог базовые позиции из прайса (`data/catalog.json`):
 * снимает пометку «удалён» и, если нужно, ручное скрытие.
 * Свои товары, цены, описания и фото не трогает.
 */
export function restoreBaseCatalog({ unhide = true } = {}) {
  const restoredIds = deletedBaseIds();
  const rest = (db.deletedProducts || []).filter((id) => !restoredIds.includes(String(id)));
  db.deletedProducts = rest;

  let unhidden = 0;
  if (unhide) {
    for (const id of hiddenBaseIds()) {
      const patch = db.overrides[id];
      delete patch.hidden;
      unhidden += 1;
      if (!Object.keys(patch).length) delete db.overrides[id];
    }
  }
  save();
  return { restored: restoredIds.length, restoredIds, unhidden, visible: publicProducts().length };
}

// ─── фото товаров ─────────────────────────────────────────────

const DATA_URL_RE = /^data:(image\/(jpeg|png|webp));base64,(.+)$/;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export function parsePhotoDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(DATA_URL_RE);
  if (!m) throw new Error('Нужно фото в формате JPEG/PNG/WebP');
  const ext = m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg';
  const buffer = Buffer.from(m[3], 'base64');
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Фото слишком большое (максимум 6 МБ)');
  }
  return { buffer, ext };
}

export function saveProductPhoto(id, buffer, ext = 'jpg') {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '_') || 'product';
  const fileName = `${safe}.${ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg'}`;
  if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  // чистим старые варианты с другим расширением
  for (const other of [`${safe}.jpg`, `${safe}.png`, `${safe}.webp`, `${safe}.jpeg`]) {
    if (other !== fileName) {
      try { fs.unlinkSync(path.join(PRODUCTS_DIR, other)); } catch {}
    }
  }
  fs.writeFileSync(path.join(PRODUCTS_DIR, fileName), buffer);
  return `assets/products/${fileName}`;
}

// ─── категории ────────────────────────────────────────────────

export function getCategories() {
  const deleted = new Set(db.deletedCategories || []);
  const baseCats = (base.categories || [])
    .filter((c) => !deleted.has(c.id))
    .map((c) => ({ ...c, ...(db.categoryOverrides[c.id] || {}), custom: false }));
  const custom = (db.customCategories || []).map((c) => ({ ...c, custom: true }));
  return [...baseCats, ...custom];
}

export function findCategory(id) {
  return getCategories().find((c) => c.id === String(id)) || null;
}

export function categoryTitle(id) {
  return findCategory(id)?.title || id;
}

function slugifyCategoryId(title) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const slug = String(title || '').toLowerCase().split('').map((ch) => map[ch] ?? ch)
    .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return slug || `cat-${Date.now().toString(36)}`;
}

export function createCategory(data) {
  const title = String(data.title || '').trim().slice(0, 80);
  if (!title) throw new Error('Укажите название категории');
  let id = String(data.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || slugifyCategoryId(title);
  if (findCategory(id)) id = `${id}-${Date.now().toString(36)}`;
  const category = {
    id,
    title,
    subtitle: String(data.subtitle || '').trim().slice(0, 80),
    emoji: String(data.emoji || '').trim().slice(0, 8),
  };
  db.customCategories.push(category);
  save();
  return { ...category, custom: true };
}

export function updateCategory(id, data) {
  const key = String(id);
  const patch = {};
  if (data.title !== undefined) {
    const title = String(data.title || '').trim().slice(0, 80);
    if (!title) throw new Error('Название категории не может быть пустым');
    patch.title = title;
  }
  if (data.subtitle !== undefined) patch.subtitle = String(data.subtitle || '').trim().slice(0, 80);
  if (data.emoji !== undefined) patch.emoji = String(data.emoji || '').trim().slice(0, 8);

  const idx = db.customCategories.findIndex((c) => c.id === key);
  if (idx !== -1) {
    Object.assign(db.customCategories[idx], patch);
    save();
    return findCategory(key);
  }
  const isBase = (base.categories || []).some((c) => c.id === key);
  if (!isBase || (db.deletedCategories || []).includes(key)) throw new Error('Категория не найдена');
  db.categoryOverrides[key] = { ...(db.categoryOverrides[key] || {}), ...patch };
  save();
  return findCategory(key);
}

export function deleteCategory(id) {
  const key = String(id);
  const count = allProducts().filter((p) => p.category === key).length;
  if (count) throw new Error(`В категории ${count} товар(а) — сначала перенесите их в другую категорию`);
  const idx = db.customCategories.findIndex((c) => c.id === key);
  if (idx !== -1) {
    db.customCategories.splice(idx, 1);
    save();
    return true;
  }
  const isBase = (base.categories || []).some((c) => c.id === key);
  if (!isBase) throw new Error('Категория не найдена');
  if (!db.deletedCategories.includes(key)) db.deletedCategories.push(key);
  delete db.categoryOverrides[key];
  save();
  return true;
}

// ─── бренд, доставка, настройки магазина ──────────────────────

export function getBrand() {
  const ov = db.shopInfo?.brand || {};
  const merged = { ...(base.brand || {}), ...ov };
  if (!merged.managers) merged.managers = [];
  return merged;
}

export function getDeliveryInfo() {
  return { ...(base.delivery || {}), ...(db.shopInfo?.delivery || {}) };
}

export function getShopSettings() {
  return {
    freeShippingFrom: Number(db.shopInfo?.shop?.freeShippingFrom ?? config.shop.freeShippingFrom) || 0,
    shippingCost: Number(db.shopInfo?.shop?.shippingCost ?? config.shop.shippingCost) || 0,
    minOrderTotal: Number(db.shopInfo?.shop?.minOrderTotal ?? config.shop.minOrderTotal) || 0,
  };
}

export function getSeller() {
  const merged = { ...config.seller, ...(db.shopInfo?.seller || {}) };
  return { ...merged, configured: Boolean(merged.inn && merged.account) };
}

const DEFAULT_TEXTS = {
  welcome: [
    '{name}, приветствуем в «Посудной лавке» 🥃',
    '',
    'Барное стекло по прямым контрактам с производствами: хайболы, олд фешн,',
    'коктейльные и винные бокалы, графины и чайная коллекция.',
    '',
    '• Каталог с актуальными ценами и наличием',
    '• Оплата картой или счёт для юрлица',
    '• Доставка по России и миру, по Москве и Санкт-Петербургу — бесплатно',
    '',
    'Можно открыть Mini App или листать каталог прямо в чате.',
  ].join('\n'),
  delivery: [
    '<b>Доставка и оплата</b>',
    '',
    'Собираем и отгружаем заказ за 1–2 рабочих дня после оплаты.',
    '',
    '• Москва и Санкт-Петербург — бесплатно',
    '• По России — бесплатно от 30 000 ₽ (СДЭК или ПЭК)',
    '• Казахстан, Беларусь, Армения, Узбекистан и другие страны — рассчитываем индивидуально',
    '',
    '<b>Оплата:</b> картой онлайн через ЮKassa или по счёту для юридических лиц с закрывающими документами.',
  ].join('\n'),
  about: [
    '«Посудная лавка» появилась из понимания, что в барной индустрии не бывает мелочей. Каждый бокал — продолжение напитка и часть впечатления гостя. Мы лично отбираем стекло по прямым контрактам на трёх производствах в Китае, чтобы предложить барам и ресторанам посуду, сочетающую эстетику и функциональность.',
    'Роман Сабанаев, сооснователь. В индустрии гостеприимства 16 лет, более 20 проектов с нуля, основатель «Pop-up Bar», в прошлом бренд-бар-менеджер El Copitas Bar, Tagliatella Caffe, Paloma Cantina, Sangre Fresca и Nola Jazz Bar.',
  ].join('\n\n'),
  footerNote: 'Прайс август 2026 · цены указаны за штуку',
};

export function getTexts() {
  return { ...DEFAULT_TEXTS, ...(db.shopInfo?.texts || {}) };
}

/** Полный снимок редактируемых настроек для админки. */
export function getShopInfo() {
  return {
    brand: getBrand(),
    delivery: getDeliveryInfo(),
    shop: getShopSettings(),
    seller: getSeller(),
    texts: getTexts(),
    categories: getCategories(),
  };
}

const SHOP_SECTIONS = ['brand', 'delivery', 'shop', 'seller', 'texts'];

/** Частичное обновление настроек магазина. Возвращает полный снимок. */
export function updateShopInfo(patch) {
  db.shopInfo = db.shopInfo || {};
  for (const section of SHOP_SECTIONS) {
    if (patch[section] && typeof patch[section] === 'object') {
      const current = db.shopInfo[section] || {};
      const next = { ...current };
      for (const [key, value] of Object.entries(patch[section])) {
        if (value === null || value === undefined) delete next[key];
        else if (typeof value === 'string') next[key] = value.slice(0, 4000);
        else next[key] = value;
      }
      // числовые поля магазина
      if (section === 'shop') {
        for (const num of ['freeShippingFrom', 'shippingCost', 'minOrderTotal']) {
          if (next[num] !== undefined) {
            const v = Number(next[num]);
            next[num] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
          }
        }
      }
      if (section === 'delivery' && next.freeFromRub !== undefined) {
        const v = Number(next.freeFromRub);
        next.freeFromRub = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
      }
      db.shopInfo[section] = next;
    }
  }
  save();
  return getShopInfo();
}

export function catalogStats() {
  const products = allProducts();
  return {
    total: products.length,
    baseTotal: (base.products || []).length,
    visible: products.filter((p) => !p.hidden).length,
    hidden: products.filter((p) => p.hidden).length,
    outOfStock: products.filter((p) => p.outOfStock).length,
    edited: Object.keys(db.overrides).length,
    custom: Object.keys(db.customProducts || {}).length,
    deleted: deletedBaseIds().length,
    categories: getCategories().length,
  };
}

export { PRODUCT_FIELDS };
