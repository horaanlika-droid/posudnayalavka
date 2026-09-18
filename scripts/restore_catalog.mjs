#!/usr/bin/env node
/**
 * Восстановление каталога из прайса: снимает в data/db.json пометки
 * «удалён» (deletedProducts) и, если нужно, ручное скрытие (overrides.hidden).
 * Позиции берутся из data/catalog.json — он собран из PDF-прайса.
 *
 * Запуск (из корня проекта):
 *   node scripts/restore_catalog.mjs              # вернуть всё, что пропало
 *   node scripts/restore_catalog.mjs --dry-run    # только показать, что вернётся
 *   node scripts/restore_catalog.mjs --keep-hidden # не снимать ручное скрытие
 *
 * Перед записью делается копия data/db.json в data/backups/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const CATALOG_FILE = path.join(ROOT, 'data', 'catalog.json');
const BUNDLE_FILE = path.join(ROOT, 'src', 'catalog.bundle.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const keepHidden = args.has('--keep-hidden');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadCatalog() {
  for (const f of [CATALOG_FILE, BUNDLE_FILE]) {
    const c = readJson(f, null);
    if (c && Array.isArray(c.products) && c.products.length) {
      if (f !== CATALOG_FILE) console.log(`ℹ️ Использую бандл ${path.relative(ROOT, f)} (${c.products.length} поз.) — основной ${path.relative(ROOT, CATALOG_FILE)} отсутствует`);
      return c;
    }
  }
  return null;
}

const catalog = loadCatalog();
if (!catalog) {
  console.error('❌ Не читается data/catalog.json и src/catalog.bundle.json — пересоберите прайс: npm run catalog');
  process.exit(1);
}

// если основного файла нет, но есть бандл — восстановим его для будущих запусков
if (!fs.existsSync(CATALOG_FILE)) {
  try {
    fs.mkdirSync(path.dirname(CATALOG_FILE), { recursive: true });
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 1));
    console.log(`✅ Восстановлен ${path.relative(ROOT, CATALOG_FILE)} из бандла`);
  } catch (err) {
    console.warn(`⚠️ Не удалось восстановить ${CATALOG_FILE}: ${err.message}`);
  }
}

const baseIds = new Set(catalog.products.map((p) => String(p.id)));
const db = readJson(DB_FILE, null);
if (!db) {
  console.log('ℹ️ data/db.json ещё нет — каталог не тронут, все позиции прайса на месте.');
  console.log(`   В прайсе: ${baseIds.size} поз.`);
  process.exit(0);
}

const deleted = (db.deletedProducts || []).map(String).filter((id) => baseIds.has(id));
const overrides = db.overrides || {};
const hidden = Object.keys(overrides)
  .filter((id) => baseIds.has(id) && overrides[id]?.hidden === true)
  .map(String);

console.log(`Прайс: ${baseIds.size} поз.`);
console.log(`Помечено удалёнными: ${deleted.length}${deleted.length ? ` → ${deleted.join(', ')}` : ''}`);
console.log(`Скрыто вручную: ${hidden.length}${hidden.length ? ` → ${hidden.join(', ')}` : ''}`);

if (!deleted.length && (keepHidden || !hidden.length)) {
  console.log('✅ Возвращать нечего — каталог полный.');
  process.exit(0);
}
if (dryRun) {
  console.log('— dry-run: файл не изменён.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(BACKUP_DIR, `db-${stamp}.json`);
fs.copyFileSync(DB_FILE, backup);

db.deletedProducts = (db.deletedProducts || []).filter((id) => !deleted.includes(String(id)));
let unhidden = 0;
if (!keepHidden) {
  for (const id of hidden) {
    delete overrides[id].hidden;
    unhidden += 1;
    if (!Object.keys(overrides[id]).length) delete overrides[id];
  }
}
db.overrides = overrides;

const tmp = `${DB_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
fs.renameSync(tmp, DB_FILE);

console.log(`↩️ Вернул позиций: ${deleted.length}`);
if (unhidden) console.log(`👁 Снял скрытие: ${unhidden}`);
console.log(`Бэкап: ${path.relative(ROOT, backup)}`);
console.log('Перезапустите приложение, чтобы витрина обновилась.');
