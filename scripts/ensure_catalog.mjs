#!/usr/bin/env node
/**
 * Гарантирует наличие data/catalog.json перед стартом.
 * Нужно для BotHost и других хостингов, где /app/data монтируется как пустой volume:
 * файлы из образа (включая catalog.json) в таком случае скрываются.
 * Если основного файла нет — копируем встроенный бандл src/catalog.bundle.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN = path.join(ROOT, 'data', 'catalog.json');
const BUNDLE = path.join(ROOT, 'src', 'catalog.bundle.json');

function read(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const main = read(MAIN);
if (main?.products?.length) {
  console.log(`[ensure_catalog] ${path.relative(ROOT, MAIN)} на месте: ${main.products.length} поз.`);
  process.exit(0);
}

const bundle = read(BUNDLE);
if (!bundle?.products?.length) {
  console.error(`[ensure_catalog] нет ни ${path.relative(ROOT, MAIN)}, ни ${path.relative(ROOT, BUNDLE)} — нужен npm run catalog`);
  process.exit(0);
}

try {
  fs.mkdirSync(path.dirname(MAIN), { recursive: true });
  fs.writeFileSync(MAIN, JSON.stringify(bundle, null, 1));
  console.log(`[ensure_catalog] восстановлен ${path.relative(ROOT, MAIN)} из ${path.relative(ROOT, BUNDLE)}: ${bundle.products.length} поз.`);
} catch (err) {
  console.error(`[ensure_catalog] не удалось восстановить: ${err.message}`);
}
